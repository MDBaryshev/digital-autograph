// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { TelegramConnection } from './telegram-connection';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('never offers linking to anonymous visitors or when the server has not configured it', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({}, { status: 401 })),
  );
  const view = render(<TelegramConnection apiOrigin="https://api.test" />);
  await screen.findByRole('alert');
  expect(
    screen.queryByRole('button', { name: 'Привязать Telegram' }),
  ).toBeNull();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({}, { status: 404 })),
  );
  view.rerender(<TelegramConnection apiOrigin="https://other.test" />);
  await screen.findByText('Привязка пока не настроена.');
  expect(screen.queryByRole('link')).toBeNull();
});
it('disconnects using the existing session and never visits a Telegram login route', async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : Response.json({ linked: true }),
  );
  vi.stubGlobal('fetch', fetcher);
  render(<TelegramConnection apiOrigin="https://api.test" />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Отвязать Telegram' }),
  );
  await screen.findByText('Telegram не привязан.');
  expect(fetcher).toHaveBeenCalledWith(
    'https://api.test/me/connections/telegram',
    expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
  );
  expect(
    fetcher.mock.calls.some(([url]) => url.includes('/auth/telegram')),
  ).toBe(false);
});
it('recovers from a stalled link operation without replaying it and discards late data after origin change', async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return new Promise<Response>(() => {});
    return Response.json({ linked: false });
  });
  vi.stubGlobal('fetch', fetcher);
  const view = render(<TelegramConnection apiOrigin="https://api.test" />);
  const button = await screen.findByRole('button', {
    name: 'Привязать Telegram',
  });
  vi.useFakeTimers();
  fireEvent.click(button);
  await act(async () => vi.advanceTimersByTimeAsync(10001));
  expect(screen.getByRole('alert').textContent).toContain(
    'Не удалось изменить',
  );
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toHaveLength(1);
  vi.useRealTimers();
  view.rerender(<TelegramConnection apiOrigin="https://other.test" />);
  await screen.findByRole('button', { name: 'Привязать Telegram' });
  expect(screen.queryByRole('alert')).toBeNull();
});
