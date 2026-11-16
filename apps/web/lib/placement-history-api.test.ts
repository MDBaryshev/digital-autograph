import { afterEach, expect, it, vi } from 'vitest';
import { placementHistoryApi } from './placement-history-api';

const origin = 'https://api.test';
const wallId = '00000000-0000-4000-8000-000000000001';
const row = {
  slotPosition: 0,
  source: 'free_claim',
  startedAt: '2026-11-14T10:00:00.000Z',
  endedAt: null,
  endReason: null,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('keeps public reads anonymous, private reads credentialed, and projects only history fields', async () => {
  vi.useFakeTimers();
  const ownerRow = {
    ...row,
    wallId,
    wallSlug: 'owner',
    wallDisplayName: 'Owner',
    wallIsPublic: false,
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      json({ wallId, placements: [{ ...row, userId: 'unrendered' }] }),
    )
    .mockResolvedValueOnce(json({ user: {} }))
    .mockResolvedValueOnce(
      json({ items: [{ ...ownerRow, internalDetails: 'unrendered' }] }),
    );
  vi.stubGlobal('fetch', fetcher);
  const api = placementHistoryApi(origin);
  expect(await api.wall(wallId)).toEqual({ wallId, placements: [row] });
  expect(await api.session()).toBe('authenticated');
  expect(await api.mine()).toEqual([ownerRow]);
  expect(
    fetcher.mock.calls.map(([url, init]) => [
      url,
      init.credentials,
      init.cache,
    ]),
  ).toEqual([
    [`${origin}/walls/${wallId}/placements`, 'omit', 'no-store'],
    [`${origin}/auth/me`, 'include', 'no-store'],
    [`${origin}/me/placements`, 'include', 'no-store'],
  ]);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  { ...row, source: 'unexpected' },
  { ...row, slotPosition: -1 },
  { ...row, startedAt: 'invalid' },
  { ...row, endedAt: 'invalid' },
  { ...row, endReason: 'internal reason' },
])('rejects invalid row fields before rendering (%j)', async (invalid) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(json({ wallId, placements: [invalid] })),
  );
  await expect(placementHistoryApi(origin).wall(wallId)).rejects.toThrow(
    'INVALID_HISTORY',
  );
});

it('rejects a history response beyond the backend 100-row bound', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        json({ wallId, placements: Array.from({ length: 101 }, () => row) }),
      ),
  );
  await expect(placementHistoryApi(origin).wall(wallId)).rejects.toThrow(
    'INVALID_HISTORY',
  );
});

it('rejects a truthy string in place of the private wall visibility boolean', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      json({
        items: [
          {
            ...row,
            wallId,
            wallSlug: 'owner',
            wallDisplayName: 'Owner',
            wallIsPublic: 'false',
          },
        ],
      }),
    ),
  );
  await expect(placementHistoryApi(origin).mine()).rejects.toThrow(
    'INVALID_HISTORY',
  );
});

it('shares one deadline between response headers and its JSON body', async () => {
  vi.useFakeTimers();
  let headers!: (value: unknown) => void;
  const fetcher = vi.fn<(input: string, init: RequestInit) => Promise<unknown>>(
    () => new Promise((resolve) => (headers = resolve)),
  );
  vi.stubGlobal('fetch', fetcher);
  const outcome = expect(
    placementHistoryApi(origin).wall(wallId),
  ).rejects.toThrow('HISTORY_REQUEST_ABORTED');
  await vi.advanceTimersByTimeAsync(9_000);
  headers({ ok: true, json: () => new Promise(() => {}) });
  await vi.advanceTimersByTimeAsync(1_000);
  await outcome;
  expect(fetcher.mock.calls[0]?.[1].signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('settles owner cancellation even when fetch ignores it and removes the parent listener', async () => {
  vi.useFakeTimers();
  const owner = new AbortController();
  const remove = vi.spyOn(owner.signal, 'removeEventListener');
  const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const outcome = expect(
    placementHistoryApi(origin).mine(owner.signal),
  ).rejects.toThrow('HISTORY_REQUEST_ABORTED');
  owner.abort();
  await outcome;
  expect(fetcher.mock.calls[0]?.[1].signal.aborted).toBe(true);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

it('does not start a request for an already canceled view', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const owner = new AbortController();
  owner.abort();
  await expect(
    placementHistoryApi(origin).wall(wallId, owner.signal),
  ).rejects.toThrow('HISTORY_REQUEST_ABORTED');
  expect(fetcher).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('distinguishes an anonymous session from an unavailable authentication service', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ error: { code: 'UNAUTHENTICATED' } }, 401)),
  );
  const api = placementHistoryApi(origin);
  expect(await api.session()).toBe('anonymous');
  await expect(api.session()).rejects.toMatchObject({
    status: 503,
    code: 'AUTH_UNAVAILABLE',
  });
  await expect(api.mine()).rejects.toMatchObject({
    status: 401,
    code: 'UNAUTHENTICATED',
  });
  expect(vi.getTimerCount()).toBe(0);
});
