import { afterEach, expect, it, vi } from 'vitest';
import { notificationRequest } from './notification-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('preserves owner request credentials and supports no-content mutations', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetcher);
  expect(
    await notificationRequest('https://api.test', '/read', 'POST'),
  ).toBeUndefined();
  expect(fetcher).toHaveBeenCalledWith(
    'https://api.test/read',
    expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }),
  );
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['fetch', 'body'])(
  'bounds a stuck %s even when it ignores abort',
  async (phase) => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(() =>
      phase === 'fetch'
        ? new Promise(() => {})
        : Promise.resolve({
            ok: true,
            status: 200,
            json: () => new Promise(() => {}),
          }),
    );
    vi.stubGlobal('fetch', fetcher);
    const pending = expect(
      notificationRequest('https://api.test', '/inbox'),
    ).rejects.toThrow('canceled or timed out');
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('external cancellation settles a transport that ignores abort', async () => {
  const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const pending = expect(
    notificationRequest(
      'https://api.test',
      '/inbox',
      'GET',
      undefined,
      controller.signal,
    ),
  ).rejects.toThrow('canceled or timed out');
  controller.abort();
  await pending;
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
});

it('does not start a request after its owner was canceled', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  controller.abort();
  await expect(
    notificationRequest(
      'https://api.test',
      '/inbox',
      'GET',
      undefined,
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
