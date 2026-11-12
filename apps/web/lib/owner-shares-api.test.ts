import { afterEach, expect, it, vi } from 'vitest';
import { ownerSharesApi, OwnerSharesApiError } from './owner-shares-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('uses owner credentials/no-store and validates cursor and revoke ID before sending', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('{"items":[],"nextCursor":null}'))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetcher);
  const api = ownerSharesApi('https://api.test');
  const signal = new AbortController().signal;
  await api.list(null, signal);
  await api.revoke('b1111111-1111-4111-8111-111111111111', signal);
  await expect(api.list('not-an-id', signal)).rejects.toThrow();
  await expect(api.revoke('not-an-id', signal)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]![1]).toMatchObject({
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
  expect(fetcher.mock.calls[1]![1]).toMatchObject({
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
  });
});

it.each(['fetch', 'body'])(
  'bounds stuck %s even when abort is ignored',
  async (phase) => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        phase === 'fetch'
          ? new Promise(() => {})
          : Promise.resolve({ ok: true, json: () => new Promise(() => {}) }),
      );
    vi.stubGlobal('fetch', fetcher);
    const pending = expect(
      ownerSharesApi('https://api.test').list(
        null,
        new AbortController().signal,
      ),
    ).rejects.toThrow('ABORTED');
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  },
);

it('settles external abort and never starts a pre-cancelled request', async () => {
  const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const pending = expect(
    ownerSharesApi('https://api.test').list(null, controller.signal),
  ).rejects.toThrow('ABORTED');
  controller.abort();
  await pending;
  await expect(
    ownerSharesApi('https://api.test').list(null, controller.signal),
  ).rejects.toThrow('ABORTED');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('preserves access status without surfacing a private error body', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('private-body', { status: 401 })),
  );
  await expect(
    ownerSharesApi('https://api.test').list(null, new AbortController().signal),
  ).rejects.toEqual(new OwnerSharesApiError(401));
});
