import { afterEach, expect, it, vi } from 'vitest';
import { workspaceRequest } from './workspace-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each([undefined, { action: 'pause' }])(
  'preserves owner request semantics and releases its deadline (%j)',
  async (body) => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    expect(
      await workspaceRequest(
        'https://api.test',
        '/test',
        controller.signal,
        body,
      ),
    ).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('https://api.test/test', {
      credentials: 'include',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(controller.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each(['fetch', 'body'])(
  'bounds a stalled %s even when transport ignores cancellation',
  async (phase) => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(() =>
      phase === 'fetch'
        ? new Promise(() => {})
        : Promise.resolve({
            ok: true,
            json: () => new Promise(() => {}),
          }),
    );
    vi.stubGlobal('fetch', fetcher);
    const owner = new AbortController();
    const outcome = expect(
      workspaceRequest('https://api.test', '/me/workspace', owner.signal),
    ).rejects.toThrow('WORKSPACE_REQUEST_ABORTED');
    await vi.advanceTimersByTimeAsync(10_000);
    await outcome;
    expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(owner.signal.aborted).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('uses one budget for headers and body rather than renewing it', async () => {
  vi.useFakeTimers();
  let headers!: (value: object) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise((resolve) => (headers = resolve))),
  );
  const outcome = expect(
    workspaceRequest(
      'https://api.test',
      '/me/workspace',
      new AbortController().signal,
    ),
  ).rejects.toThrow('WORKSPACE_REQUEST_ABORTED');
  await vi.advanceTimersByTimeAsync(9_000);
  headers({ ok: true, json: () => new Promise(() => {}) });
  await vi.advanceTimersByTimeAsync(1_000);
  await outcome;
  expect(vi.getTimerCount()).toBe(0);
});

it('settles owner cancellation immediately and removes its listener', async () => {
  vi.useFakeTimers();
  const owner = new AbortController();
  const remove = vi.spyOn(owner.signal, 'removeEventListener');
  const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const outcome = expect(
    workspaceRequest('https://api.test', '/me/workspace', owner.signal),
  ).rejects.toThrow('WORKSPACE_REQUEST_ABORTED');
  owner.abort();
  await outcome;
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

it('does not start fetch for an already canceled owner', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const owner = new AbortController();
  owner.abort();
  await expect(
    workspaceRequest('https://api.test', '/me/workspace', owner.signal),
  ).rejects.toThrow('WORKSPACE_REQUEST_ABORTED');
  expect(fetcher).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  [401, 'IGNORED', 'SIGN_IN'],
  [409, 'FIRST_USE_REQUIRED', 'FIRST_USE_REQUIRED'],
  [403, 'FORBIDDEN', 'FORBIDDEN'],
])('retains HTTP %s handling', async (status, code, expected) => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { code } }), { status }),
      ),
  );
  await expect(
    workspaceRequest('https://api.test', '/test', new AbortController().signal),
  ).rejects.toThrow(expected);
  expect(vi.getTimerCount()).toBe(0);
});
