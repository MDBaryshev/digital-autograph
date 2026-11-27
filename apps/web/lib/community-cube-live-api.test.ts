// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  communityCubeLiveApi,
  withCubeDeadline,
} from './community-cube-live-api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('does not start work for a cancelled owner request', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  controller.abort();
  const work = vi.fn();
  await expect(
    withCubeDeadline(controller.signal, work),
  ).rejects.toHaveProperty('name', 'AbortError');
  expect(work).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('settles on owner cancellation when the transport ignores abort and does not read a late response body', async () => {
  vi.useFakeTimers();
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((finish) => {
        resolve = finish;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  const result = communityCubeLiveApi('https://api.example.test').cube(
    controller.signal,
  );
  const rejected = expect(result).rejects.toHaveProperty('name', 'AbortError');
  controller.abort();
  await rejected;
  const json = vi.fn();
  resolve({ json } as unknown as Response);
  await Promise.resolve();
  expect(json).not.toHaveBeenCalled();
  expect(fetcher.mock.calls).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves an ordinary HTTP failure and clears the deadline', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'CUBE_REQUEST_CONFLICT' } },
          { status: 409 },
        ),
      ),
  );
  await expect(
    communityCubeLiveApi('https://api.example.test').cube(
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 409, code: 'CUBE_REQUEST_CONFLICT' });
  expect(vi.getTimerCount()).toBe(0);
});
