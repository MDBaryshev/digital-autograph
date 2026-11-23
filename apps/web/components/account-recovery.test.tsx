// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { AccountWorkspace } from './account-workspace';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const workspace = {
  profile: { id: 'creator', slug: 'owner', displayName: 'Owner' },
  walls: [],
  autographs: [],
  canModerate: false,
  canEditProfile: true,
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(['fetch', 'body'])(
  'recovers an initial stuck %s using GET and ignores its later response',
  async (phase) => {
    let late!: (value: unknown) => void;
    const deferred = new Promise((resolve) => (late = resolve));
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() =>
        phase === 'fetch'
          ? deferred
          : Promise.resolve({ ok: true, json: () => deferred }),
      )
      .mockResolvedValueOnce(response(workspace));
    vi.stubGlobal('fetch', fetcher);
    vi.useFakeTimers();
    render(<AccountWorkspace apiOrigin="https://api.test" section="walls" />);
    expect(screen.getByText('Loading your space…')).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole('alert').textContent).toContain('Could not load');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(
      screen.getByRole('button', { name: 'Create draft Wall' }),
    ).toBeTruthy();
    await act(async () => {
      late(phase === 'fetch' ? response({}) : {});
    });
    expect(
      screen.getByRole('button', { name: 'Create draft Wall' }),
    ).toBeTruthy();
    expect(fetcher.mock.calls.map(([, init]) => init.method)).toEqual([
      'GET',
      'GET',
    ]);
  },
);

it.each(['fetch', 'body'])(
  'requires a fresh GET after a stuck create %s without replaying POST',
  async (phase) => {
    let late!: (value: unknown) => void;
    const deferred = new Promise((resolve) => (late = resolve));
    const created = {
      ...workspace,
      walls: [
        {
          id: 'wall',
          status: 'draft',
          slotCount: 10,
          createdAt: '2026-11-14T10:00:00Z',
        },
      ],
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(workspace))
      .mockImplementationOnce(() =>
        phase === 'fetch'
          ? deferred
          : Promise.resolve({ ok: true, json: () => deferred }),
      )
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response(created));
    vi.stubGlobal('fetch', fetcher);
    render(<AccountWorkspace apiOrigin="https://api.test" section="walls" />);
    const create = await screen.findByRole('button', {
      name: 'Create draft Wall',
    });
    vi.useFakeTimers();
    fireEvent.click(create);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(
      (
        screen.getByRole('button', {
          name: 'Create draft Wall',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.submit(create.closest('form')!);
    expect(fetcher).toHaveBeenCalledTimes(2);
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh account status' }),
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(
      (
        screen.getByRole('button', {
          name: 'Create draft Wall',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh account status' }),
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(
      screen.queryByRole('button', { name: 'Create draft Wall' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Publish Wall' })).toBeTruthy();
    await act(async () => late(phase === 'fetch' ? response({}) : {}));
    expect(screen.queryByText('Changes saved.')).toBeNull();
    expect(fetcher.mock.calls.map(([, init]) => init.method)).toEqual([
      'GET',
      'POST',
      'GET',
      'GET',
    ]);
  },
);

it('keeps writes locked while the successful create is being read back', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(workspace))
    .mockResolvedValueOnce(response({}, 201))
    .mockReturnValueOnce(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  render(<AccountWorkspace apiOrigin="https://api.test" section="walls" />);
  const create = await screen.findByRole('button', {
    name: 'Create draft Wall',
  });
  vi.useFakeTimers();
  fireEvent.click(create);
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(
    (
      screen.getByRole('button', {
        name: 'Create draft Wall',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.submit(create.closest('form')!);
  expect(fetcher.mock.calls.map(([, init]) => init.method)).toEqual([
    'GET',
    'POST',
    'GET',
  ]);
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(
    screen.getByRole('button', { name: 'Refresh account status' }),
  ).toBeTruthy();
});

it('does not unlock writes on a malformed recovery response', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(workspace))
    .mockReturnValueOnce(new Promise(() => {}))
    .mockResolvedValueOnce(response(null));
  vi.stubGlobal('fetch', fetcher);
  render(<AccountWorkspace apiOrigin="https://api.test" section="walls" />);
  const create = await screen.findByRole('button', {
    name: 'Create draft Wall',
  });
  vi.useFakeTimers();
  fireEvent.click(create);
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh account status' }),
  );
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(screen.getByRole('alert').textContent).toContain('Could not load');
  expect(
    (
      screen.getByRole('button', {
        name: 'Create draft Wall',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.submit(create.closest('form')!);
  expect(fetcher.mock.calls.map(([, init]) => init.method)).toEqual([
    'GET',
    'POST',
    'GET',
  ]);
});

it('unlocks profile saves only after reading the current account, without retrying PUT', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/me/appearance')) return response({}, 503);
    if (init.method === 'PUT') return new Promise<Response>(() => {});
    return response(workspace);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<AccountWorkspace apiOrigin="https://api.test" section="settings" />);
  const save = await screen.findByRole('button', { name: 'Save profile' });
  const nameInput = screen.getByRole('textbox', {
    name: 'Display name',
  }) as HTMLInputElement;
  fireEvent.change(nameInput, { target: { value: 'Unconfirmed edit' } });
  vi.useFakeTimers();
  fireEvent.submit(save.closest('form')!);
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(
    (screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.submit(save.closest('form')!);
  expect(
    fetcher.mock.calls.filter(([, init]) => init.method === 'PUT'),
  ).toHaveLength(1);
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh account status' }),
  );
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(
    (screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  expect(
    fetcher.mock.calls.filter(([, init]) => init.method === 'PUT'),
  ).toHaveLength(1);
  expect(
    (screen.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement)
      .value,
  ).toBe(workspace.profile.displayName);
});

it('recovers a stuck owner preview and does not expose a late image', async () => {
  const autographs = [
    {
      id: 'own',
      source: 'canvas',
      status: 'ready',
      createdAt: '2026-11-14T10:00:00Z',
    },
  ];
  let late!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ ...workspace, autographs }))
    .mockImplementationOnce(
      () => new Promise<Response>((resolve) => (late = resolve)),
    )
    .mockResolvedValueOnce(
      response({
        assetId: 'asset',
        url: 'https://private.test/current',
        expiresAt: '2099-01-01T00:00:00Z',
      }),
    )
    .mockResolvedValueOnce(response({ ...workspace, autographs }));
  vi.stubGlobal('fetch', fetcher);
  render(
    <AccountWorkspace apiOrigin="https://api.test" section="autographs" />,
  );
  const preview = await screen.findByRole('button', {
    name: 'Open private preview',
  });
  vi.useFakeTimers();
  fireEvent.click(preview);
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(
    (
      screen.getByRole('button', {
        name: 'Open private preview',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  fireEvent.click(preview);
  await act(() => vi.advanceTimersByTimeAsync(0));
  await act(async () =>
    late(
      response({
        assetId: 'old',
        url: 'https://private.test/late',
        expiresAt: '2099-01-01T00:00:00Z',
      }),
    ),
  );
  expect(
    screen.getByAltText('Your private cleaned autograph').getAttribute('src'),
  ).toBe('https://private.test/current');
  expect(fetcher.mock.calls.every(([, init]) => init.method === 'GET')).toBe(
    true,
  );
});

it('cancels a pending write on unmount without a refresh or a leaked timer', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(workspace))
    .mockReturnValueOnce(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const view = render(
    <AccountWorkspace apiOrigin="https://api.test" section="walls" />,
  );
  const create = await screen.findByRole('button', {
    name: 'Create draft Wall',
  });
  vi.useFakeTimers();
  fireEvent.click(create);
  const signal = fetcher.mock.calls[1]![1].signal as AbortSignal;
  view.unmount();
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
