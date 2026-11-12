// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { NotificationCenter } from './notification-center';
import { LocaleProvider } from './locale-provider';

const origin = 'https://api.test';
const pref = {
  web: true,
  telegram: false,
  mutedKinds: [],
  telegramLinked: false,
  telegramAvailable: false,
};
const inbox = [
  {
    id: 'notice',
    title: 'Private inbox item',
    detail: null,
    deepLink: '/walls/wall#slot-slot',
    readAt: null,
  },
];
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const loaded = () =>
  vi
    .fn()
    .mockResolvedValueOnce(response(pref))
    .mockResolvedValueOnce(response(inbox));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('requires explicit GET recovery after an unconfirmed mutation and never replays it', async () => {
  const mutation = deferred();
  const fetcher = loaded()
    .mockReturnValueOnce(mutation.promise)
    .mockResolvedValueOnce(response({ ...pref, web: false }))
    .mockResolvedValueOnce(response(inbox));
  vi.stubGlobal('fetch', fetcher);
  render(<NotificationCenter apiOrigin={origin} />);
  await screen.findByText('Private inbox item');
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'In-app notifications' }),
  );
  const save = screen.getByRole('button', { name: 'Save preferences' });
  fireEvent.click(save);
  fireEvent.submit(save.closest('form')!);
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh notifications' }),
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
  await act(async () => mutation.resolve(response({}, 503)));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Changes could not be confirmed. Refresh notifications before trying again.',
  );
  expect(screen.queryByText('Private inbox item')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save preferences' })).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(3);
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh notifications' }),
  );
  const checkbox = await screen.findByRole('checkbox', {
    name: 'In-app notifications',
  });
  expect((checkbox as HTMLInputElement).checked).toBe(false);
  expect(fetcher.mock.calls.map(([, options]) => options.method)).toEqual([
    'GET',
    'GET',
    'PUT',
    'GET',
    'GET',
  ]);
});

it('a stuck mutation times out, allows GET recovery and ignores its late success', async () => {
  const mutation = deferred();
  const fetcher = loaded()
    .mockReturnValueOnce(mutation.promise)
    .mockResolvedValueOnce(response(pref))
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', fetcher);
  render(<NotificationCenter apiOrigin={origin} />);
  await screen.findByText('Private inbox item');
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.getByRole('alert').textContent).toContain(
    'could not be confirmed',
  );
  expect(fetcher.mock.calls[2]![1].signal.aborted).toBe(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh notifications' }),
  );
  await act(async () => {});
  expect(screen.getByText('No notifications.')).toBeTruthy();
  await act(async () => mutation.resolve(response(pref)));
  expect(fetcher).toHaveBeenCalledTimes(5);
  expect(screen.getByText('No notifications.')).toBeTruthy();
});

it('bounds initial reads, keeps refresh focus while busy and suppresses repeated GETs', async () => {
  const p = deferred();
  const i = deferred();
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(p.promise)
    .mockReturnValueOnce(i.promise)
    .mockResolvedValueOnce(response(pref))
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', fetcher);
  vi.useFakeTimers();
  render(<NotificationCenter apiOrigin={origin} />);
  const refresh = screen.getByRole('button', { name: 'Refresh notifications' });
  refresh.focus();
  fireEvent.click(refresh);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect((refresh as HTMLButtonElement).disabled).toBe(false);
  expect(refresh.getAttribute('aria-disabled')).toBe('true');
  await act(async () => vi.advanceTimersByTimeAsync(10_000));
  expect(screen.getByRole('alert').textContent).toContain(
    'Could not load notifications',
  );
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);
  fireEvent.click(refresh);
  await act(async () => {});
  expect(screen.getByText('No notifications.')).toBeTruthy();
  expect(document.activeElement).toBe(refresh);
  await act(async () => {
    p.resolve(response(pref));
    i.resolve(response(inbox));
  });
  expect(screen.queryByText('Private inbox item')).toBeNull();
});

it('replaces private state on origin change and ignores a late mutation error', async () => {
  const mutation = deferred();
  const fetcher = loaded()
    .mockReturnValueOnce(mutation.promise)
    .mockResolvedValueOnce(response(pref))
    .mockResolvedValueOnce(response([{ ...inbox[0], title: 'New inbox' }]));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<NotificationCenter apiOrigin={origin} />);
  await screen.findByText('Private inbox item');
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  view.rerender(<NotificationCenter apiOrigin="https://other.test" />);
  expect(screen.queryByText('Private inbox item')).toBeNull();
  expect(fetcher.mock.calls[2]![1].signal.aborted).toBe(true);
  await screen.findByText('New inbox');
  await act(async () => mutation.resolve(response({}, 401)));
  expect(screen.getByText('New inbox')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(fetcher.mock.calls[3]![0]).toBe(
    'https://other.test/me/notifications/preferences',
  );
});

it('ignores late reads for a replaced origin', async () => {
  const p = deferred();
  const i = deferred();
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(p.promise)
    .mockReturnValueOnce(i.promise)
    .mockResolvedValueOnce(response(pref))
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<NotificationCenter apiOrigin={origin} />);
  view.rerender(<NotificationCenter apiOrigin="https://other.test" />);
  await screen.findByText('No notifications.');
  await act(async () => {
    p.resolve(response(pref));
    i.resolve(response(inbox));
  });
  expect(screen.queryByText('Private inbox item')).toBeNull();
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
});

it('does not redirect to a late Telegram link from a replaced origin', async () => {
  const link = deferred();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({ ...pref, telegramAvailable: true }))
    .mockResolvedValueOnce(response(inbox))
    .mockReturnValueOnce(link.promise)
    .mockResolvedValueOnce(response(pref))
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', fetcher);
  const locationBefore = window.location.href;
  // jsdom reports attempted cross-document navigation through this console.
  const navigationError = vi
    .spyOn(window.console, 'error')
    .mockImplementation(() => {});
  try {
    const view = render(<NotificationCenter apiOrigin={origin} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Connect Telegram and consent to notifications',
      }),
    );
    view.rerender(<NotificationCenter apiOrigin="https://other.test" />);
    await screen.findByText('No notifications.');
    await act(async () =>
      link.resolve(
        response({
          url: 'https://t.me/example_bot?start=old-private-challenge',
        }),
      ),
    );
    expect(fetcher.mock.calls[2]![1].signal.aborted).toBe(true);
    expect(window.location.href).toBe(locationBefore);
    expect(navigationError).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(5);
  } finally {
    navigationError.mockRestore();
  }
});

it.each([401, 403])(
  'clears private state when a refresh loses access (%s)',
  async (status) => {
    const fetcher = loaded()
      .mockResolvedValueOnce(response({}, status))
      .mockReturnValueOnce(new Promise(() => {}));
    vi.stubGlobal('fetch', fetcher);
    render(<NotificationCenter apiOrigin={origin} />);
    await screen.findByText('Private inbox item');
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh notifications' }),
    );
    await screen.findByRole('alert');
    expect(screen.queryByText('Private inbox item')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(fetcher.mock.calls[3]![1].signal.aborted).toBe(true);
  },
);

it('cancels outstanding work on unmount', async () => {
  const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<NotificationCenter apiOrigin={origin} />);
  view.unmount();
  for (const [, options] of fetcher.mock.calls)
    expect(options.signal.aborted).toBe(true);
});

it('reloads authoritative preferences after a confirmed write', async () => {
  const fetcher = loaded()
    .mockResolvedValueOnce(response(pref))
    .mockResolvedValueOnce(response({ ...pref, web: false }))
    .mockResolvedValueOnce(response([]));
  vi.stubGlobal('fetch', fetcher);
  render(<NotificationCenter apiOrigin={origin} />);
  await screen.findByText('Private inbox item');
  fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
  await screen.findByText('No notifications.');
  expect(
    (
      screen.getByRole('checkbox', {
        name: 'In-app notifications',
      }) as HTMLInputElement
    ).checked,
  ).toBe(false);
  expect(fetcher.mock.calls.map(([, options]) => options.method)).toEqual([
    'GET',
    'GET',
    'PUT',
    'GET',
    'GET',
  ]);
});

it('localizes recovery controls and errors in Russian', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('private transport text')),
  );
  render(
    <LocaleProvider initialLocale="ru">
      <NotificationCenter apiOrigin={origin} />
    </LocaleProvider>,
  );
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Не удалось загрузить уведомления. Обнови их, чтобы повторить попытку.',
  );
  expect(
    screen.getByRole('button', { name: 'Обновить уведомления' }),
  ).toBeTruthy();
  expect(screen.queryByText('private transport text')).toBeNull();
});
