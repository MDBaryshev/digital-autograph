// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { AdminLookup } from './admin-lookup';

vi.mock('./account-session', () => ({
  AccountSession: ({ returnTo }: { returnTo: string }) => (
    <a href={returnTo}>Sign in</a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const origin = 'https://api.example.test';
const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const item = (value = id) => ({
  kind: 'user',
  id: value,
  state: 'active',
  createdAt: '2026-11-27T00:00:00.000Z',
});
const result = (value = id) => Response.json({ items: [item(value)] });
async function mount() {
  await act(async () => {
    render(<AdminLookup apiOrigin={origin} />);
  });
}
async function search(value = id) {
  fireEvent.change(screen.getByLabelText('Record ID'), { target: { value } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Search records' }));
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

it.each([401, 403])(
  'does not display a search form when access is denied with %s',
  async (status) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({}, { status }));
    vi.stubGlobal('fetch', fetcher);
    await mount();
    expect(screen.queryByLabelText('Record ID')).toBeNull();
    if (status === 401)
      expect(
        screen.getByRole('link', { name: 'Sign in' }).getAttribute('href'),
      ).toBe('/admin');
    else
      expect(screen.getByRole('alert').textContent).toContain(
        'Administrator access',
      );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe(origin + '/admin/lookup');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      credentials: 'include',
      cache: 'no-store',
    });
  },
);

it('searches only on explicit submission and removes all results if the next read loses permission', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ items: [] }))
    .mockResolvedValueOnce(result())
    .mockResolvedValueOnce(Response.json({}, { status: 403 }));
  vi.stubGlobal('fetch', fetcher);
  await mount();
  fireEvent.change(screen.getByLabelText('Record ID'), {
    target: { value: id },
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Search records' }));
  });
  expect(screen.getByText(id)).toBeTruthy();
  expect(fetcher.mock.calls[1]![0]).toBe(origin + '/admin/lookup?id=' + id);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Search records' }));
  });
  expect(screen.queryByText(id)).toBeNull();
  expect(screen.queryByLabelText('Record ID')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain(
    'Administrator access',
  );
});

it.each(['headers', 'body'])(
  'recovers stalled %s on the deadline and ignores late bytes after explicit retry',
  async (stage) => {
    vi.useFakeTimers();
    const late = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockImplementationOnce(() =>
        stage === 'headers'
          ? late.promise
          : Promise.resolve({
              ok: true,
              status: 200,
              json: () => late.promise.then((response) => response.json()),
            }),
      )
      .mockResolvedValueOnce(result());
    vi.stubGlobal('fetch', fetcher);
    await mount();
    await search();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole('alert').textContent).toContain(
      'Try the search again',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Search records' }));
    });
    expect(screen.getByText(id)).toBeTruthy();
    await act(async () => late.resolve(result(other)));
    expect(screen.getByText(id)).toBeTruthy();
    expect(screen.queryByText(other)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(3);
  },
);

it('cancels a prior lookup when the input changes and never renders its late result', async () => {
  const late = deferred<Response>();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ items: [] }))
    .mockReturnValueOnce(late.promise)
    .mockResolvedValueOnce(result(other));
  vi.stubGlobal('fetch', fetcher);
  await mount();
  await search();
  await search(other);
  expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);
  expect(screen.getByText(other)).toBeTruthy();
  await act(async () => late.resolve(result()));
  expect(screen.queryByText(id)).toBeNull();
  expect(screen.getByText(other)).toBeTruthy();
});

it('clears private results on tab hiding and probes access again without replaying the ID', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ items: [] }))
    .mockResolvedValueOnce(result())
    .mockResolvedValueOnce(Response.json({}, { status: 403 }));
  vi.stubGlobal('fetch', fetcher);
  await mount();
  await search();
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue('hidden');
  await act(async () => {
    fireEvent(document, new Event('visibilitychange'));
  });
  expect(screen.queryByText(id)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  visibility.mockReturnValue('visible');
  await act(async () => {
    fireEvent(document, new Event('visibilitychange'));
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[2]![0]).toBe(origin + '/admin/lookup');
  expect(screen.queryByLabelText('Record ID')).toBeNull();
});

it.each([
  { items: [{ ...item(), storageKey: 'private-do-not-display' }] },
  { items: [item(other)] },
  { items: Array.from({ length: 7 }, () => item()) },
])('withholds malformed or mismatched server records', async (body) => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(Response.json(body)),
  );
  await mount();
  await search();
  expect(screen.getByRole('alert').textContent).toContain(
    'Try the search again',
  );
  expect(screen.queryByRole('list', { name: 'Search results' })).toBeNull();
  expect(document.body.textContent).not.toContain('private-do-not-display');
});

it('rejects an invalid ID locally and aborts pending access on unmount', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ items: [] }));
  vi.stubGlobal('fetch', fetcher);
  await mount();
  await search('not-a-uuid');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert').textContent).toContain(
    'valid internal record ID',
  );
  cleanup();
  const late = deferred<Response>();
  fetcher.mockReturnValueOnce(late.promise);
  const view = render(<AdminLookup apiOrigin={origin} />);
  view.unmount();
  expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);
  await act(async () => late.resolve(Response.json({ items: [] })));
  expect(screen.queryByLabelText('Record ID')).toBeNull();
});
