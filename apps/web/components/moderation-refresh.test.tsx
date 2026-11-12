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
import { ModerationWorkspace } from './moderation-workspace';
import { LocaleProvider } from './locale-provider';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const item = {
  id: 'b1111111-1111-4111-8111-111111111111',
  source: 'canvas',
  approvedAt: '2026-11-10T12:00:00Z',
  createdAt: '2026-11-10T11:00:00Z',
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const privatePreview = () =>
  response({
    url: 'https://private.example.test/opaque-preview',
    expiresAt: new Date(Date.now() + 120000).toISOString(),
  });
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('finds a new submission from an empty queue without reloading or sending POST', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ items: [], nextCursor: null }))
    .mockResolvedValueOnce(response({ items: [item], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<ModerationWorkspace apiOrigin="https://api.example.test" />);
  expect(await screen.findByText('No submissions in this page.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
  expect(await screen.findByRole('button', { name: /canvas ·/ })).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [url, options] of fetcher.mock.calls) {
    expect(url).toBe('https://api.example.test/moderation/autographs?limit=20');
    expect(options).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
  }
});

it('retries a failed initial queue with an explicit GET', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce(response({ items: [item], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<ModerationWorkspace apiOrigin="https://api.example.test" />);
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry queue' }));
  expect(await screen.findByRole('button', { name: /canvas ·/ })).toBeTruthy();
  expect(fetcher.mock.calls.map(([, options]) => options.method)).toEqual([
    'GET',
    'GET',
  ]);
});

it('replaces pagination and ignores a late page after refresh', async () => {
  const oldPage = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      response({ items: [item], nextCursor: 'old-cursor' }),
    )
    .mockReturnValueOnce(oldPage.promise)
    .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<ModerationWorkspace apiOrigin="https://api.example.test" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  expect(fetcher).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
  expect(await screen.findByText('No submissions in this page.')).toBeTruthy();
  expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);
  expect(fetcher.mock.calls[1]![0]).toContain('cursor=old-cursor');
  expect(fetcher.mock.calls[2]![0]).not.toContain('cursor=');
  await act(async () =>
    oldPage.resolve(
      response({
        items: [{ ...item, source: 'photo' }],
        nextCursor: 'stale-cursor',
      }),
    ),
  );
  expect(screen.queryByRole('button', { name: /photo ·/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
});

it('clears the selected private preview and ignores its late response after refresh', async () => {
  const oldPreview = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ items: [item], nextCursor: null }))
    .mockReturnValueOnce(oldPreview.promise)
    .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<ModerationWorkspace apiOrigin="https://api.example.test" />);
  fireEvent.click(await screen.findByRole('button', { name: /canvas ·/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
  expect(await screen.findByText('No submissions in this page.')).toBeTruthy();
  expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);
  await act(async () => oldPreview.resolve(privatePreview()));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
});

it.each([401, 403])(
  'removes private review and controls when refreshed access returns %s',
  async (status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [item], nextCursor: null }))
      .mockResolvedValueOnce(privatePreview())
      .mockResolvedValueOnce(response({ error: { code: 'FORBIDDEN' } }, status))
      .mockResolvedValue(response({}));
    vi.stubGlobal('fetch', fetcher);
    render(<ModerationWorkspace apiOrigin="https://api.example.test" />);
    fireEvent.click(await screen.findByRole('button', { name: /canvas ·/ }));
    expect(await screen.findByRole('img')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
    if (status === 403) await screen.findByRole('alert');
    else await screen.findByText('Sign in with a platform moderator account.');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(
      fetcher.mock.calls.every(([, options]) => options.method !== 'POST'),
    ).toBe(true);
  },
);

it('blocks queue reads during a decision, then recovers a conflict by GET without repeating POST', async () => {
  const decision = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ items: [item], nextCursor: 'next' }))
    .mockResolvedValueOnce(privatePreview())
    .mockReturnValueOnce(decision.promise)
    .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<ModerationWorkspace apiOrigin="https://api.example.test" />);
  fireEvent.click(await screen.findByRole('button', { name: /canvas ·/ }));
  fireEvent.load(await screen.findByRole('img'));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  expect(fetcher).toHaveBeenCalledTimes(3);
  await act(async () =>
    decision.resolve(
      response({ error: { code: 'MODERATION_ALREADY_DECIDED' } }, 409),
    ),
  );
  expect(
    await screen.findByText(
      'Another moderator already made a different decision. Refresh the queue.',
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry queue' }));
  expect(await screen.findByText('No submissions in this page.')).toBeTruthy();
  expect(
    fetcher.mock.calls.filter(([, options]) => options.method === 'POST'),
  ).toHaveLength(1);
});

it('discards the previous origin and ignores its late response', async () => {
  const previous = deferred();
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(previous.promise)
    .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  const view = render(
    <ModerationWorkspace apiOrigin="https://old.example.test" />,
  );
  view.rerender(<ModerationWorkspace apiOrigin="https://new.example.test" />);
  expect(await screen.findByText('No submissions in this page.')).toBeTruthy();
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  await act(async () =>
    previous.resolve(response({ items: [item], nextCursor: null })),
  );
  expect(screen.queryByRole('button', { name: /canvas ·/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(fetcher.mock.calls[2]![0]).toMatch(/^https:\/\/new.example.test/);
});

it('bounds a queue read even when the transport ignores abort, and permits only an explicit retry', async () => {
  vi.useFakeTimers();
  const pending = deferred();
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<ModerationWorkspace apiOrigin="https://api.example.test" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(screen.getByRole('button', { name: 'Retry queue' })).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  await act(async () =>
    pending.resolve(response({ items: [item], nextCursor: null })),
  );
  expect(screen.queryByRole('button', { name: /canvas ·/ })).toBeNull();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Retry queue' })),
  );
  expect(screen.getByText('No submissions in this page.')).toBeTruthy();
});

it('aborts outstanding requests on unmount', async () => {
  const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const view = render(
    <ModerationWorkspace apiOrigin="https://api.example.test" />,
  );
  view.unmount();
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
});

it('bounds an unknown decision and ignores a late success until explicit GET recovery', async () => {
  const decision = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ items: [item], nextCursor: null }))
    .mockResolvedValueOnce(privatePreview())
    .mockReturnValueOnce(decision.promise)
    .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetcher);
  render(<ModerationWorkspace apiOrigin="https://api.example.test" />);
  fireEvent.click(await screen.findByRole('button', { name: /canvas ·/ }));
  fireEvent.load(await screen.findByRole('img'));
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(screen.getByRole('button', { name: 'Retry queue' })).toBeTruthy();
  expect(fetcher.mock.calls[2]![1].signal.aborted).toBe(true);
  await act(async () =>
    decision.resolve(
      response({ id: item.id, status: 'ready', decision: 'approved' }),
    ),
  );
  expect(
    screen.queryByText('Approved. The autograph is ready but remains private.'),
  ).toBeNull();
  expect(screen.queryByRole('img')).toBeNull();
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Retry queue' })),
  );
  expect(screen.getByText('No submissions in this page.')).toBeTruthy();
  expect(
    fetcher.mock.calls.filter(([, options]) => options.method === 'POST'),
  ).toHaveLength(1);
});

it('localizes refresh and recovery controls in Russian', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ items: [], nextCursor: null }))
    .mockRejectedValueOnce(new Error('network'));
  vi.stubGlobal('fetch', fetcher);
  render(
    <LocaleProvider initialLocale="ru">
      <ModerationWorkspace apiOrigin="https://api.example.test" />
    </LocaleProvider>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Обновить очередь' }),
  );
  expect(
    await screen.findByRole('button', { name: 'Повторить загрузку очереди' }),
  ).toBeTruthy();
});

it('treats a malformed queue as unavailable instead of rendering stale review controls', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(response({ items: null, nextCursor: null })),
  );
  render(<ModerationWorkspace apiOrigin="https://api.example.test" />);
  expect(
    await screen.findByRole('button', { name: 'Retry queue' }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
});
