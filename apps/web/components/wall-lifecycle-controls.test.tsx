// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { WallStatus } from '@digital-autograph/domain';
import { AccountWorkspace } from './account-workspace';
import { WallLifecycleControls } from './wall-lifecycle-controls';
import { LocaleProvider } from './locale-provider';

const apiOrigin = 'https://api.example.test';
const wallId = '00000000-0000-4000-8000-000000000001';
function workspace(status: WallStatus) {
  return {
    profile: { id: 'creator', slug: 'owner', displayName: 'Owner' },
    walls: [
      { id: wallId, status, slotCount: 10, createdAt: '2026-11-01T12:00:00Z' },
    ],
    autographs: [],
    canModerate: false,
    canEditProfile: true,
  };
}
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function mount() {
  return render(<AccountWorkspace apiOrigin={apiOrigin} section="walls" />);
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([
  ['draft', 'Publish Wall', 'publish', 'live', 'Pause Wall'],
  ['scheduled', 'Return Wall to draft', 'unschedule', 'draft', 'Publish Wall'],
  ['scheduled', 'Publish Wall', 'publish', 'live', 'Pause Wall'],
  ['live', 'Pause Wall', 'pause', 'paused', 'Resume Wall'],
  ['paused', 'Resume Wall', 'resume', 'live', 'Pause Wall'],
  ['live', 'End Wall', 'end', 'ended', 'Archive Wall'],
  ['paused', 'End Wall', 'end', 'ended', 'Archive Wall'],
  ['ended', 'Archive Wall', 'archive', 'archived', null],
] as const)(
  'confirms %s → %s and trusts the refreshed workspace',
  async (before, label, action, after, nextLabel) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(workspace(before)))
      // Ignore the transition response status: only the subsequent owner read
      // determines visible state, including a concurrent lifecycle change.
      .mockResolvedValueOnce(response({ status: 'incorrect-response-value' }))
      .mockResolvedValueOnce(response(workspace(after)));
    vi.stubGlobal('fetch', fetcher);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: label }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cancel' }),
    );
    fireEvent.click(screen.getByRole('button', { name: `Confirm: ${label}` }));
    await screen.findByText('Wall status refreshed.');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      `${apiOrigin}/walls/${wallId}/transitions`,
    );
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify({ action }),
    });
    expect(fetcher.mock.calls[2]?.[0]).toBe(`${apiOrigin}/me/workspace`);
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (nextLabel)
      expect(screen.getByRole('button', { name: nextLabel })).toBeTruthy();
    else {
      expect(
        screen.getByText(
          'This Wall is archived. Your account cannot create another Wall.',
        ),
      ).toBeTruthy();
      expect(screen.queryByRole('button', { name: /Wall$/ })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Open Wall' })).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Create draft Wall' }),
      ).toBeNull();
    }
  },
);

it('cancels with Escape or Cancel and restores keyboard focus without a write', async () => {
  const fetcher = vi.fn().mockResolvedValue(response(workspace('live')));
  vi.stubGlobal('fetch', fetcher);
  mount();
  const trigger = await screen.findByRole('button', {
    name: 'End Wall',
  });
  fireEvent.click(trigger);
  expect(screen.getByText(/Ending cannot be undone/)).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), {
    key: 'Escape',
  });
  expect(
    screen.queryByRole('group', { name: 'Confirm Wall action' }),
  ).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(document.activeElement).toBe(trigger);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('submits only one POST on repeated confirmation and keeps old state until GET completes', async () => {
  let finishPost!: (value: Response) => void;
  let finishRead!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(workspace('live')))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishPost = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishRead = resolve;
        }),
    );
  vi.stubGlobal('fetch', fetcher);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pause Wall' }));
  const confirm = screen.getByRole('button', { name: 'Confirm: Pause Wall' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    (
      screen.getByRole('button', {
        name: 'End Wall',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.queryByRole('button', { name: 'Resume Wall' })).toBeNull();
  finishPost(response({ status: 'paused' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(screen.queryByRole('button', { name: 'Resume Wall' })).toBeNull();
  finishRead(response(workspace('paused')));
  await screen.findByRole('button', { name: 'Resume Wall' });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it.each(['lost response', 'conflict', 'refresh failed'] as const)(
  'recovers %s using GET only before permitting another action',
  async (failure) => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(workspace('live')));
    if (failure === 'lost response')
      fetcher.mockRejectedValueOnce(Error('synthetic network failure'));
    else if (failure === 'conflict')
      fetcher.mockResolvedValueOnce(
        response({ error: { code: 'INVALID_WALL_TRANSITION' } }, 409),
      );
    else
      fetcher
        .mockResolvedValueOnce(response({ status: 'paused' }))
        .mockRejectedValueOnce(Error('synthetic read failure'));
    fetcher.mockResolvedValueOnce(response(workspace('paused')));
    vi.stubGlobal('fetch', fetcher);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Pause Wall' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm: Pause Wall' }),
    );
    await screen.findByRole('button', { name: 'Refresh Wall status' });
    expect(
      (
        screen.getByRole('button', {
          name: 'End Wall',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh Wall status' }),
    );
    await screen.findByRole('button', { name: 'Resume Wall' });
    expect(
      fetcher.mock.calls.filter((call) => call[1]?.method === 'POST'),
    ).toHaveLength(1);
    expect(fetcher.mock.calls.at(-1)?.[1]?.method).toBe('GET');
  },
);

it.each([
  ['SIGN_IN', 401, 'Your session expired. Sign in again to manage your Wall.'],
  ['FORBIDDEN', 403, 'You no longer have access to manage this Wall.'],
  [
    'INVALID_WALL_CONFIGURATION',
    400,
    'This Wall cannot open with its current start and end times.',
  ],
] as const)(
  'handles %s without exposing the server payload or retrying a write',
  async (code, status, message) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(workspace('paused')))
      .mockResolvedValueOnce(
        response(
          { error: { code, detail: 'synthetic-private-detail' } },
          status,
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Resume Wall' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm: Resume Wall' }),
    );
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText('synthetic-private-detail')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    if (status === 401)
      expect(
        screen
          .getByRole('link', { name: 'Sign in to continue' })
          .getAttribute('href'),
      ).toBe('/me');
  },
);

it('keeps first-use confirmation explicit and preserves the Walls return route', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(workspace('draft')))
    .mockResolvedValueOnce(
      response({ error: { code: 'FIRST_USE_REQUIRED' } }, 409),
    );
  vi.stubGlobal('fetch', fetcher);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Publish Wall' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm: Publish Wall' }),
  );
  const link = await screen.findByRole('link', {
    name: 'Открыть подтверждения в новой вкладке',
  });
  expect(link.getAttribute('href')).toBe(
    '/legal/first-use?returnTo=%2Fme%2Fwalls',
  );
  expect(link.getAttribute('target')).toBe('_blank');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('shows Russian confirmations and the permanent one-Wall archive limit', async () => {
  const fetcher = vi.fn().mockResolvedValue(response(workspace('ended')));
  vi.stubGlobal('fetch', fetcher);
  render(
    <LocaleProvider initialLocale="ru">
      <AccountWorkspace apiOrigin={apiOrigin} section="walls" />
    </LocaleProvider>,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Архивировать стену',
    }),
  );
  expect(screen.getByText(/Архивирование нельзя отменить/)).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Подтвердить: Архивировать стену' }),
  ).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('bounds a stalled write and unlocks only the read-only recovery action', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(workspace('live')))
    .mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
  vi.stubGlobal('fetch', fetcher);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pause Wall' }));
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm: Pause Wall' }));
  await act(() => vi.advanceTimersByTimeAsync(15_000));
  expect(
    screen.getByRole('button', { name: 'Refresh Wall status' }),
  ).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'End Wall' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('invalidates confirmation when the server snapshot changes, even if the action remains available', () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <WallLifecycleControls
      apiOrigin={apiOrigin}
      wall={{ id: wallId, status: 'live' }}
      refresh={refresh}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'End Wall' }));
  expect(
    screen.getByRole('button', { name: 'Confirm: End Wall' }),
  ).toBeTruthy();
  view.rerender(
    <WallLifecycleControls
      apiOrigin={apiOrigin}
      wall={{ id: wallId, status: 'paused' }}
      refresh={refresh}
    />,
  );
  expect(
    screen.queryByRole('button', { name: 'Confirm: End Wall' }),
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'End Wall' }));
  expect(
    screen.getByRole('button', { name: 'Confirm: End Wall' }),
  ).toBeTruthy();
  expect(refresh).not.toHaveBeenCalled();
});

it('aborts an in-flight request on unmount without initiating a refresh', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(workspace('live')))
    .mockImplementationOnce(() => new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const view = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pause Wall' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm: Pause Wall' }));
  const signal = fetcher.mock.calls[1]?.[1]?.signal as AbortSignal;
  expect(signal.aborted).toBe(false);
  view.unmount();
  expect(signal.aborted).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
