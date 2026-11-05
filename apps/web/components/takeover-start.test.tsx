// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { TakeoverStart } from './takeover-start';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
const props = {
  apiOrigin: 'https://api.example.test',
  wallId: 'wall',
  slotId: 'slot',
  autographId: 'autograph',
  onReserved: vi.fn(),
  now: Date.parse('2026-11-05T12:00:00Z'),
};

it('retries an unknown reservation result with the exact quote and key without extending or duplicating the hold', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ id: 'quote' }))
    .mockRejectedValueOnce(new TypeError('connection lost'))
    .mockResolvedValueOnce(
      Response.json({
        id: 'reservation',
        status: 'active',
        expiresAt: '2026-11-05T12:05:00Z',
      }),
    );
  vi.stubGlobal('fetch', fetcher);
  const view = render(<TakeoverStart {...props} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Reserve for 5 minutes' }),
  );
  await screen.findByRole('alert');
  // A public refresh may now show our hold even though the first POST response was lost.
  view.rerender(<TakeoverStart {...props} reserved />);
  fireEvent.click(screen.getByRole('button', { name: 'Resume reservation' }));
  const link = await screen.findByRole('link', { name: 'Continue to payment' });
  expect(link.getAttribute('href')).toBe(
    '/payments/checkout?reservationId=reservation&autographId=autograph',
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
  const first = fetcher.mock.calls[1]![1];
  const retry = fetcher.mock.calls[2]![1];
  expect(retry.body).toBe(first.body);
  expect(retry.headers['Idempotency-Key']).toBe(
    first.headers['Idempotency-Key'],
  );
  view.rerender(<TakeoverStart {...props} reserved />);
  expect(
    screen.getByRole('link', { name: 'Continue to payment' }),
  ).toBeTruthy();
});

it('does not request a foreign hold and never advances an expired reservation to checkout', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ id: 'quote' }))
    .mockResolvedValueOnce(
      Response.json({
        id: 'old',
        status: 'expired',
        expiresAt: '2026-11-05T11:59:00Z',
      }),
    );
  vi.stubGlobal('fetch', fetcher);
  const view = render(<TakeoverStart {...props} reserved />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  view.rerender(<TakeoverStart {...props} />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'no longer available',
    ),
  );
  expect(screen.queryByRole('link')).toBeNull();
});

it('restores an explicit retry after reload without a new quote or a longer reservation', async () => {
  const key = 'persisted-checkout-key-1234';
  sessionStorage.setItem(
    `destka-checkout:${props.apiOrigin}:${props.wallId}:${props.slotId}`,
    JSON.stringify({ key, quoteId: 'saved-quote' }),
  );
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      id: 'existing-reservation',
      status: 'active',
      expiresAt: '2026-11-05T12:05:00Z',
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  render(<TakeoverStart {...props} reserved />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Resume reservation' }),
  );
  expect(
    await screen.findByRole('link', { name: 'Continue to payment' }),
  ).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]![0]).toBe(
    `${props.apiOrigin}/takeover-reservations`,
  );
  expect(fetcher.mock.calls[0]![1].headers['Idempotency-Key']).toBe(key);
});
