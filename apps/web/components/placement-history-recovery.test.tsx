// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import {
  UserPlacementHistory,
  WallPlacementHistory,
} from './placement-history';

const origin = 'https://api.test';
const wallId = '11111111-1111-4111-8111-111111111111';
const otherWall = '22222222-2222-4222-8222-222222222222';
const publicPlacement = {
  slotPosition: 0,
  source: 'free_claim',
  startedAt: '2026-11-14T09:00:00Z',
  endedAt: null,
  endReason: null,
};
const ownPlacement = {
  ...publicPlacement,
  wallId,
  wallSlug: 'creator',
  wallDisplayName: 'Creator',
  wallIsPublic: true,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const wallHistory = (placements = [publicPlacement]) =>
  json({ wallId, placements });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(['wall', 'origin', 'refresh'] as const)(
  'discards the displayed public list immediately when %s changes',
  async (change) => {
    const pending = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(wallHistory())
      .mockReturnValueOnce(pending.promise);
    vi.stubGlobal('fetch', fetcher);
    const view = render(
      <WallPlacementHistory apiOrigin={origin} wallId={wallId} />,
    );
    expect(await screen.findByText('Current placement')).toBeTruthy();
    view.rerender(
      <WallPlacementHistory
        apiOrigin={change === 'origin' ? 'https://other-api.test' : origin}
        wallId={change === 'wall' ? otherWall : wallId}
        refreshVersion={change === 'refresh' ? 1 : 0}
      />,
    );
    expect(screen.queryByText('Current placement')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('Loading Wall history…')).toBeTruthy();
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      `${change === 'origin' ? 'https://other-api.test' : origin}/walls/${change === 'wall' ? otherWall : wallId}/placements`,
    );
  },
);

it('does not restore a stale Current placement after refresh fails and retries with GET only', async () => {
  const pending = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(wallHistory())
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(wallHistory([]));
  vi.stubGlobal('fetch', fetcher);
  const view = render(
    <WallPlacementHistory apiOrigin={origin} wallId={wallId} />,
  );
  expect(await screen.findByText('Current placement')).toBeTruthy();
  view.rerender(
    <WallPlacementHistory
      apiOrigin={origin}
      wallId={wallId}
      refreshVersion={1}
    />,
  );
  await act(async () => pending.reject(new TypeError('offline')));
  expect(screen.queryByText('Current placement')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry Wall history' }));
  expect(
    await screen.findByText('No placements have been recorded yet.'),
  ).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(
    fetcher.mock.calls.every(
      ([, options]) => !options.method || options.method === 'GET',
    ),
  ).toBe(true);
});

it.each(['fetch', 'body'] as const)(
  'bounds a stuck public %s and ignores its late response after recovery',
  async (phase) => {
    vi.useFakeTimers();
    const pending = deferred<unknown>();
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() =>
        phase === 'fetch'
          ? pending.promise
          : Promise.resolve({ ok: true, json: () => pending.promise }),
      )
      .mockResolvedValueOnce(wallHistory([]));
    vi.stubGlobal('fetch', fetcher);
    render(<WallPlacementHistory apiOrigin={origin} wallId={wallId} />);
    await act(() => vi.advanceTimersByTimeAsync(9_999));
    expect(
      screen.queryByRole('button', { name: 'Retry Wall history' }),
    ).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(fetcher.mock.calls[0]?.[1].signal.aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Wall history' }));
    await act(async () => {});
    expect(
      screen.getByText('No placements have been recorded yet.'),
    ).toBeTruthy();
    await act(async () =>
      pending.resolve(
        phase === 'fetch'
          ? wallHistory()
          : { wallId, placements: [publicPlacement] },
      ),
    );
    expect(screen.queryByText('Current placement')).toBeNull();
    expect(
      screen.getByText('No placements have been recorded yet.'),
    ).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each(['session-fetch', 'history-body'] as const)(
  'recovers a stuck private %s by rechecking the session and ignores the late result',
  async (phase) => {
    vi.useFakeTimers();
    const pending = deferred<unknown>();
    const fetcher = vi.fn();
    if (phase === 'session-fetch') fetcher.mockReturnValueOnce(pending.promise);
    else
      fetcher
        .mockResolvedValueOnce(json({ user: {} }))
        .mockResolvedValueOnce({ ok: true, json: () => pending.promise });
    fetcher
      .mockResolvedValueOnce(json({ user: {} }))
      .mockResolvedValueOnce(json({ items: [] }));
    vi.stubGlobal('fetch', fetcher);
    render(<UserPlacementHistory apiOrigin={origin} />);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    const requestIndex = phase === 'session-fetch' ? 0 : 1;
    expect(fetcher.mock.calls[requestIndex]?.[1].signal.aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry your history' }));
    await act(async () => {});
    expect(screen.getByText('You have no Wall placements yet.')).toBeTruthy();
    await act(async () =>
      pending.resolve(
        phase === 'session-fetch'
          ? json({ user: {} })
          : { items: [ownPlacement] },
      ),
    );
    expect(screen.queryByText('Current placement')).toBeNull();
    expect(screen.getByText('You have no Wall placements yet.')).toBeTruthy();
    expect(fetcher.mock.calls.map(([url]) => new URL(url).pathname)).toEqual(
      phase === 'session-fetch'
        ? ['/auth/me', '/auth/me', '/me/placements']
        : ['/auth/me', '/me/placements', '/auth/me', '/me/placements'],
    );
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('treats cross-wall and malformed public payloads as failed reads before a valid retry', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      json({ wallId: otherWall, placements: [publicPlacement] }),
    )
    .mockResolvedValueOnce(
      json({
        wallId,
        placements: [{ ...publicPlacement, startedAt: 'invalid' }],
      }),
    )
    .mockResolvedValueOnce(wallHistory());
  vi.stubGlobal('fetch', fetcher);
  render(<WallPlacementHistory apiOrigin={origin} wallId={wallId} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry Wall history' }),
  );
  expect(screen.queryByText('Current placement')).toBeNull();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry Wall history' }),
  );
  expect(await screen.findByText('Current placement')).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('discards private history immediately on origin change and shows sign-in if the new history read returns 401', async () => {
  const pending = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(json({ user: {} }))
    .mockResolvedValueOnce(json({ items: [ownPlacement] }))
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(json({ error: { code: 'UNAUTHENTICATED' } }, 401));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<UserPlacementHistory apiOrigin={origin} />);
  expect(await screen.findByText('Current placement')).toBeTruthy();
  view.rerender(<UserPlacementHistory apiOrigin="https://other-api.test" />);
  expect(screen.queryByText('Current placement')).toBeNull();
  expect(screen.queryByRole('link', { name: "Creator's Wall" })).toBeNull();
  expect(screen.getByText('Checking sign-in…')).toBeTruthy();
  await act(async () => pending.resolve(json({ user: {} })));
  expect(
    await screen.findByText('Sign in to view your placement history.'),
  ).toBeTruthy();
  expect(screen.queryByText('Current placement')).toBeNull();
  expect(
    screen
      .getByRole('link', { name: 'Continue with Google' })
      .getAttribute('href'),
  ).toBe(
    'https://other-api.test/auth/google/start?returnTo=%2Fme%2Fplacements',
  );
});

it.each(['public', 'private'] as const)(
  'aborts pending %s history on unmount without a leaked deadline or follow-up request',
  async (kind) => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    const fetcher = vi.fn();
    if (kind === 'private') fetcher.mockResolvedValueOnce(json({ user: {} }));
    fetcher.mockReturnValue(pending.promise);
    vi.stubGlobal('fetch', fetcher);
    const view = render(
      kind === 'public' ? (
        <WallPlacementHistory apiOrigin={origin} wallId={wallId} />
      ) : (
        <UserPlacementHistory apiOrigin={origin} />
      ),
    );
    await act(async () => {});
    const requestIndex = kind === 'private' ? 1 : 0;
    const signal = fetcher.mock.calls[requestIndex]?.[1].signal;
    expect(signal.aborted).toBe(false);
    view.unmount();
    await act(async () => {});
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () =>
      pending.resolve(
        kind === 'public' ? wallHistory() : json({ items: [ownPlacement] }),
      ),
    );
    expect(fetcher).toHaveBeenCalledTimes(kind === 'private' ? 2 : 1);
    expect(screen.queryByText('Current placement')).toBeNull();
  },
);
