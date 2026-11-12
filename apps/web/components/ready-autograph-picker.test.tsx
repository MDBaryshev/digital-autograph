// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { ReadyAutographPicker } from './ready-autograph-picker';
import { LocaleProvider } from './locale-provider';

const origin = 'https://api.test';
const one = 'a1111111-1111-4111-8111-111111111111';
const two = 'b1111111-1111-4111-8111-111111111111';
const choices = [one, two].map((id) => ({
  id,
  source: 'canvas' as const,
  createdAt: '2026-11-12T00:00:00.000Z',
  moderatedAt: '2026-11-12T00:00:00.000Z',
}));
const preview = (name: string, lifetime = 120_000) => ({
  assetId: name,
  url: `https://private.test/${name}`,
  expiresAt: new Date(Date.now() + lifetime).toISOString(),
});
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const props = { apiOrigin: origin, choices, onSelect: vi.fn() };
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('discards an origin-specific URL before reading the same ID from a new origin', async () => {
  const next = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(preview('old-origin')))
    .mockReturnValueOnce(next.promise);
  vi.stubGlobal('fetch', fetcher);
  const view = render(<ReadyAutographPicker {...props} selectedId={one} />);
  await screen.findByRole('img');
  view.rerender(
    <ReadyAutographPicker
      {...props}
      selectedId={one}
      apiOrigin="https://other.test"
    />,
  );
  expect(screen.queryByRole('img')).toBeNull();
  expect(fetcher.mock.calls[1]![0]).toBe(
    `https://other.test/autographs/${one}/preview`,
  );
  await act(async () => next.resolve(response(preview('new-origin'))));
  expect((await screen.findByRole('img')).getAttribute('src')).toBe(
    'https://private.test/new-origin',
  );
});

it('ignores an old selection response even when its transport ignores cancellation', async () => {
  const old = deferred();
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(response(preview('current')));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<ReadyAutographPicker {...props} selectedId={one} />);
  view.rerender(<ReadyAutographPicker {...props} selectedId={two} />);
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  await screen.findByRole('img');
  await act(async () => old.resolve(response(preview('stale'))));
  expect(screen.getByRole('img').getAttribute('src')).toBe(
    'https://private.test/current',
  );
});

it.each(['', 'not-a-uuid', 'c1111111-1111-4111-8111-111111111111'])(
  'does not fetch a missing or invalid ready choice (%s)',
  (selectedId) => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(<ReadyAutographPicker {...props} selectedId={selectedId} />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).toBeNull();
    fireEvent.click(screen.getAllByRole('radio')[1]!);
    expect(props.onSelect).toHaveBeenCalledWith(two);
  },
);

it('removes a selected preview when its choice disappears and aborts its read', async () => {
  const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<ReadyAutographPicker {...props} selectedId={one} />);
  view.rerender(
    <ReadyAutographPicker {...props} choices={[]} selectedId={one} />,
  );
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it.each(['fetch', 'body'])(
  'times out a stuck %s and permits an explicit GET retry without changing the selection',
  async (phase) => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() =>
        phase === 'fetch'
          ? new Promise(() => {})
          : Promise.resolve({
              ok: true,
              status: 200,
              json: () => new Promise(() => {}),
            }),
      )
      .mockResolvedValueOnce(response(preview('retried')));
    vi.stubGlobal('fetch', fetcher);
    vi.useFakeTimers();
    render(<ReadyAutographPicker {...props} selectedId={one} />);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole('alert').textContent).toContain(
      'Preview unavailable',
    );
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh private preview' }),
    );
    await act(async () => {});
    expect(screen.getByRole('img').getAttribute('src')).toBe(
      'https://private.test/retried',
    );
    expect(fetcher.mock.calls).toHaveLength(2);
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toBe(`${origin}/autographs/${one}/preview`);
      expect(options).toMatchObject({
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
    }
    expect(props.onSelect).not.toHaveBeenCalled();
  },
);

it('retains refresh focus and suppresses duplicate reads while allowing another radio choice', async () => {
  const refreshed = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(preview('initial')))
    .mockReturnValueOnce(refreshed.promise);
  vi.stubGlobal('fetch', fetcher);
  render(<ReadyAutographPicker {...props} selectedId={one} />);
  await screen.findByRole('img');
  const refresh = screen.getByRole('button', {
    name: 'Refresh private preview',
  });
  refresh.focus();
  fireEvent.click(refresh);
  fireEvent.click(refresh);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('img')).toBeNull();
  expect(refresh.getAttribute('aria-disabled')).toBe('true');
  expect((refresh as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getAllByRole('radio')[1]!);
  expect(props.onSelect).toHaveBeenCalledWith(two);
  await act(async () => refreshed.resolve(response(preview('new'))));
  expect(document.activeElement).toBe(refresh);
});

it('hides an expiring preview while its early renewal is stuck', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(preview('expiring', 6000)))
    .mockReturnValueOnce(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  vi.useFakeTimers();
  render(<ReadyAutographPicker {...props} selectedId={one} />);
  await act(async () => {});
  expect(screen.getByRole('img')).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('img')).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('hides a short-lived preview at expiry without creating an automatic retry loop', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValueOnce(response(preview('short', 1000))),
  );
  vi.useFakeTimers();
  render(<ReadyAutographPicker {...props} selectedId={one} />);
  await act(async () => {});
  expect(screen.getByRole('img')).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByRole('alert')).toBeTruthy();
});

it.each([
  { url: 'https://private.test/bad', expiresAt: 'not-a-date' },
  { url: 'https://private.test/bad', expiresAt: '2020-01-01T00:00:00.000Z' },
  { url: 'https://private.test/bad', expiresAt: '2026-02-30T00:00:00.000Z' },
  { url: 'javascript:bad', expiresAt: '2099-01-01T00:00:00.000Z' },
  null,
])('rejects malformed or expired preview metadata', async (value) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(value)));
  render(<ReadyAutographPicker {...props} selectedId={one} />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('img')).toBeNull();
});

it('does not let an old image error clear a newer preview', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(preview('old')))
    .mockResolvedValueOnce(response(preview('new')));
  vi.stubGlobal('fetch', fetcher);
  render(<ReadyAutographPicker {...props} selectedId={one} />);
  const old = await screen.findByRole('img');
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh private preview' }),
  );
  await screen.findByRole('img');
  fireEvent.error(old);
  expect(screen.getByRole('img').getAttribute('src')).toBe(
    'https://private.test/new',
  );
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByRole('alert')).toBeTruthy();
});

it.each([401, 403, 404])(
  'removes a private image after access failure (%s)',
  async (status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(preview('initial')))
      .mockResolvedValueOnce(response({}, status));
    vi.stubGlobal('fetch', fetcher);
    render(<ReadyAutographPicker {...props} selectedId={one} />);
    await screen.findByRole('img');
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh private preview' }),
    );
    await screen.findByRole('alert');
    expect(screen.queryByRole('img')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);

it('cleans up renewal/deadline timers and cancels pending work on unmount', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(preview('initial')))
    .mockReturnValueOnce(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<ReadyAutographPicker {...props} selectedId={one} />);
  await act(async () => {});
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh private preview' }),
  );
  view.unmount();
  await act(async () => {});
  expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('uses the existing Russian preview/recovery messages', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(Error('private URL details')),
  );
  render(
    <LocaleProvider initialLocale="ru">
      <ReadyAutographPicker {...props} selectedId={one} />
    </LocaleProvider>,
  );
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Предпросмотр недоступен. Обнови его и повтори попытку.',
  );
  expect(screen.queryByText('private URL details')).toBeNull();
});

it('immediately removes A when its parent selects B before the new GET finishes', async () => {
  const second = deferred();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(preview('one')))
      .mockReturnValueOnce(second.promise),
  );
  const view = render(<ReadyAutographPicker {...props} selectedId={one} />);
  const image = await screen.findByRole('img');
  expect(image.getAttribute('src')).toBe('https://private.test/one');
  view.rerender(<ReadyAutographPicker {...props} selectedId={two} />);
  expect(screen.queryByRole('img')).toBeNull();
  await act(async () => second.resolve(response(preview('two'))));
  expect((await screen.findByRole('img')).getAttribute('src')).toBe(
    'https://private.test/two',
  );
});
