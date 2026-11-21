// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { OwnerShareLinks } from './owner-share-links';
import { LocaleProvider } from './locale-provider';

const origin = 'https://api.example.test';
const item = {
  id: 'b1111111-1111-4111-8111-111111111111',
  wallId: 'c1111111-1111-4111-8111-111111111111',
  slotNumber: 2,
  event: 'slot_claimed',
  publicAlias: 'My alias',
  createdAt: '2026-11-12T10:00:00.000Z',
  revokedAt: null,
};
const response = (
  items: unknown[] = [item],
  nextCursor: string | null = null,
) => new Response(JSON.stringify({ items, nextCursor }));
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('lists an existing share after mount and confirms or cancels revocation without premature DELETE', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      response([{ ...item, revokedAt: '2026-11-12T11:00:00.000Z' }]),
    );
  vi.stubGlobal('fetch', fetcher);
  render(<OwnerShareLinks apiOrigin={origin} />);
  const revoke = await screen.findByRole('button', {
    name: 'Revoke public link',
  });
  expect(
    screen.getByRole('link', { name: 'Open share card' }).getAttribute('href'),
  ).toBe('/s/' + item.id);
  fireEvent.click(revoke);
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Confirm revocation' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel revocation' }));
  expect(document.activeElement).toBe(revoke);
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(revoke);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revocation' }));
  expect(await screen.findByText('Public link revoked.')).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Refresh links' }),
  );
  expect(
    screen.queryByRole('button', { name: 'Revoke public link' }),
  ).toBeNull();
  expect(screen.queryByRole('link', { name: 'Open share card' })).toBeNull();
  expect(fetcher.mock.calls.map(([url, opts]) => [url, opts.method])).toEqual([
    [origin + '/me/shares?limit=20', 'GET'],
    [origin + '/me/shares/' + item.id, 'DELETE'],
    [origin + '/me/shares?limit=20', 'GET'],
  ]);
});

it('paginates old links and resets the cursor when the list is refreshed', async () => {
  const second = {
    ...item,
    id: 'b2222222-2222-4222-8222-222222222222',
    publicAlias: 'Older alias',
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response([item], item.id))
    .mockResolvedValueOnce(response([second]))
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', fetcher);
  render(<OwnerShareLinks apiOrigin={origin} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Load more links' }),
  );
  await screen.findByText(/Older alias/);
  expect(fetcher.mock.calls[1]![0]).toBe(
    origin + '/me/shares?limit=20&cursor=' + item.id,
  );
  expect(
    screen.getAllByRole('button', { name: 'Revoke public link' }),
  ).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
  await screen.findByText(
    'No public links yet. Create a share card on a Wall to find it here.',
  );
  expect(fetcher.mock.calls[2]![0]).toBe(origin + '/me/shares?limit=20');
});

it('does not steal focus if the user moved away while revocation was pending', async () => {
  const deletion = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockReturnValueOnce(deletion.promise)
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', fetcher);
  render(
    <>
      <a href="/elsewhere">Other page</a>
      <OwnerShareLinks apiOrigin={origin} />
    </>,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Revoke public link' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revocation' }));
  const other = screen.getByRole('link', { name: 'Other page' });
  other.focus();
  await act(async () => deletion.resolve(new Response(null, { status: 204 })));
  await screen.findByText('Public link revoked.');
  expect(document.activeElement).toBe(other);
});

it('a stuck DELETE times out and requires explicit GET recovery without replay, ignoring its late success', async () => {
  const deletion = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockReturnValueOnce(deletion.promise)
    .mockResolvedValueOnce(
      response([{ ...item, revokedAt: '2026-11-12T11:00:00.000Z' }]),
    );
  vi.stubGlobal('fetch', fetcher);
  render(<OwnerShareLinks apiOrigin={origin} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Revoke public link' }),
  );
  vi.useFakeTimers();
  const confirm = screen.getByRole('button', { name: 'Confirm revocation' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.getByRole('alert').textContent).toContain(
    'Revocation could not be confirmed',
  );
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Refresh links' }),
  );
  expect(screen.queryByText(/My alias/)).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Confirm revocation' }),
  ).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh links' }));
  await act(async () => {});
  expect(screen.getByText(/^Revoked:/)).toBeTruthy();
  await act(async () => deletion.resolve(new Response(null, { status: 204 })));
  expect(fetcher.mock.calls.map(([, opts]) => opts.method)).toEqual([
    'GET',
    'DELETE',
    'GET',
  ]);
});

it.each([401, 403])(
  'clears private rows and actions after losing access on pagination (%s)',
  async (status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response([item], item.id))
      .mockResolvedValueOnce(new Response('{}', { status }));
    vi.stubGlobal('fetch', fetcher);
    render(<OwnerShareLinks apiOrigin={origin} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Load more links' }),
    );
    await screen.findByRole('alert');
    expect(screen.queryByText(/My alias/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Revoke public link' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Load more links' }),
    ).toBeNull();
  },
);

it('replaces private origin state and does not start a stale post-DELETE refresh', async () => {
  const deletion = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response())
    .mockReturnValueOnce(deletion.promise)
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<OwnerShareLinks apiOrigin={origin} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Revoke public link' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revocation' }));
  view.rerender(<OwnerShareLinks apiOrigin="https://other.example.test" />);
  expect(screen.queryByText(/My alias/)).toBeNull();
  expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);
  await screen.findByText(
    'No public links yet. Create a share card on a Wall to find it here.',
  );
  await act(async () => deletion.resolve(new Response(null, { status: 204 })));
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[2]![0]).toBe(
    'https://other.example.test/me/shares?limit=20',
  );
});

it('bounds a stuck read and preserves refresh focus while suppressing duplicate reads', async () => {
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(new Promise(() => {}))
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', fetcher);
  vi.useFakeTimers();
  render(<OwnerShareLinks apiOrigin={origin} />);
  const refresh = screen.getByRole('button', { name: 'Refresh links' });
  refresh.focus();
  fireEvent.click(refresh);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((refresh as HTMLButtonElement).disabled).toBe(false);
  expect(refresh.getAttribute('aria-disabled')).toBe('true');
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.getByRole('alert').textContent).toContain(
    'Could not load your public links',
  );
  fireEvent.click(refresh);
  await act(async () => {});
  expect(
    screen.getByText(
      'No public links yet. Create a share card on a Wall to find it here.',
    ),
  ).toBeTruthy();
  expect(document.activeElement).toBe(refresh);
});

it('does not display unrecognized private metadata from a malformed response', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        response([{ ...item, storageKey: 'private-original-marker' }]),
      ),
  );
  render(<OwnerShareLinks apiOrigin={origin} />);
  await screen.findByRole('alert');
  expect(screen.queryByText(/private-original-marker/)).toBeNull();
  expect(screen.queryByText(/My alias/)).toBeNull();
});

it('cancels reads on unmount and localizes the read recovery', async () => {
  const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<OwnerShareLinks apiOrigin={origin} />);
  view.unmount();
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(Error('private transport text')),
  );
  render(
    <LocaleProvider initialLocale="ru">
      <OwnerShareLinks apiOrigin={origin} />
    </LocaleProvider>,
  );
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Не удалось загрузить публичные ссылки. Обнови список, чтобы повторить попытку.',
  );
  expect(screen.getByRole('button', { name: 'Обновить ссылки' })).toBeTruthy();
});
