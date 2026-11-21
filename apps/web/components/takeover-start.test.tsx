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
import { TakeoverStart } from './takeover-start';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
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

const activeReservation = {
  id: 'confirmed-reservation',
  status: 'active',
  expiresAt: '2026-11-05T12:05:00Z',
};

it.each(['headers', 'body'])(
  'releases the reservation button after stalled %s and retries only on click with the same key',
  async (stall) => {
    vi.useFakeTimers();
    let finishLate!: () => void;
    const late = new Promise<typeof activeReservation>((resolve) => {
      finishLate = () => resolve({ ...activeReservation, id: 'late' });
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'quote' }))
      .mockImplementationOnce(() =>
        stall === 'headers'
          ? late.then((reservation) => Response.json(reservation))
          : Promise.resolve({ ok: true, json: () => late }),
      )
      .mockResolvedValueOnce(Response.json(activeReservation));
    vi.stubGlobal('fetch', fetcher);
    const view = render(<TakeoverStart {...props} />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Reserve for 5 minutes' }),
      );
    });
    expect(
      (screen.getByRole('button', { name: 'Reserving…' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole('alert').textContent).toContain(
      'Retry the same request',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);

    view.rerender(<TakeoverStart {...props} reserved />);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Resume reservation' }),
      );
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const original = fetcher.mock.calls[1]![1];
    const retry = fetcher.mock.calls[2]![1];
    expect(retry.body).toBe(original.body);
    expect(retry.headers['Idempotency-Key']).toBe(
      original.headers['Idempotency-Key'],
    );
    await act(async () => finishLate());
    expect(
      screen
        .getByRole('link', { name: 'Continue to payment' })
        .getAttribute('href'),
    ).toContain('reservationId=confirmed-reservation');
    expect(props.onReserved).toHaveBeenCalledTimes(1);
  },
);

it('does not start a reservation when the quote arrives after the deadline', async () => {
  vi.useFakeTimers();
  let finishQuote!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finishQuote = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  render(<TakeoverStart {...props} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Reserve for 5 minutes' }),
  );
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  await act(async () => finishQuote(Response.json({ id: 'late' })));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert').textContent).toContain(
    'Retry the same request',
  );
  expect(
    (
      screen.getByRole('button', {
        name: 'Reserve for 5 minutes',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});

it('aborts on unmount and ignores late reservation completion', async () => {
  let finishReservation!: (response: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ id: 'quote' }))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finishReservation = resolve;
        }),
    );
  vi.stubGlobal('fetch', fetcher);
  const view = render(<TakeoverStart {...props} />);
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Reserve for 5 minutes' }),
    );
  });
  view.unmount();
  expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);
  await act(async () => finishReservation(Response.json(activeReservation)));
  expect(props.onReserved).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
