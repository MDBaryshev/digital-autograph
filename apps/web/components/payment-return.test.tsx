// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { PaymentReturn } from './payment-return';
import { LocaleProvider } from './locale-provider';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const origin = 'https://api.example.test';
const response = (id: string, status: string) =>
  new Response(JSON.stringify({ id, status }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('does not apply a delayed result of the previous order to the current order', async () => {
  let finish!: (response: Response) => void;
  const delayed = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url.includes(first)
        ? delayed
        : Promise.resolve(response(second, 'provider_pending')),
    ),
  );
  const view = render(<PaymentReturn apiOrigin={origin} orderId={first} />);
  view.rerender(<PaymentReturn apiOrigin={origin} orderId={second} />);
  await screen.findByText('Payment is pending.');
  await act(async () => {
    finish(response(first, 'fulfilled'));
    await delayed;
  });
  expect(screen.getByRole('status').textContent).toBe('Payment is pending.');
});

it.each([
  ['created', 'Payment is being prepared.'],
  ['provider_pending', 'Payment is pending.'],
  ['unknown', 'Payment status is being checked. Do not start another payment.'],
  ['succeeded', 'Payment received. Placement is not confirmed yet.'],
  ['canceled', 'Payment was canceled.'],
  [
    'paid_but_not_fulfilled',
    'Payment received, but placement could not be completed. Manual review is required.',
  ],
  ['fulfilled', 'Your placement is complete.'],
])(
  'reads %s without a provider refresh on opening the page',
  async (status, message) => {
    const fetcher = vi.fn().mockResolvedValue(response(first, status));
    vi.stubGlobal('fetch', fetcher);
    render(<PaymentReturn apiOrigin={origin} orderId={first} />);
    await screen.findByText(message);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `${origin}/payments/orders/${first}`,
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBeUndefined();
  },
);

it('keeps StrictMode mount/replay read-only and aborts the obsolete read', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(response(first, 'provider_pending')),
    );
  vi.stubGlobal('fetch', fetcher);
  render(
    <StrictMode>
      <PaymentReturn apiOrigin={origin} orderId={first} />
    </StrictMode>,
  );
  await screen.findByText('Payment is pending.');
  expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(1);
  expect(fetcher.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(
    true,
  );
  if (fetcher.mock.calls.length > 1)
    expect(fetcher.mock.calls[0]?.[1]?.signal.aborted).toBe(true);
});

it.each([
  '',
  '-'.repeat(36),
  '11111111-1111-1111-1111-111111111111',
  '../another-order',
  'not-an-order',
])('rejects invalid references without any request: %s', (id) => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<PaymentReturn apiOrigin={origin} orderId={id} />);
  expect(screen.getByRole('status').textContent).toBe(
    'Invalid order reference.',
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole('button')).toBeNull();
});

it('normalizes UUID case before comparing the owner response', async () => {
  const id = 'abcdef00-1111-4111-8111-111111111111';
  const fetcher = vi
    .fn()
    .mockResolvedValue(response(id.toUpperCase(), 'fulfilled'));
  vi.stubGlobal('fetch', fetcher);
  render(<PaymentReturn apiOrigin={origin} orderId={id.toUpperCase()} />);
  await screen.findByText('Your placement is complete.');
  expect(fetcher.mock.calls[0]?.[0]).toBe(`${origin}/payments/orders/${id}`);
});

it.each([
  { status: 'fulfilled' },
  { id: second, status: 'fulfilled' },
  { id: first, status: 'paid' },
  { id: first, status: 'success' },
  { id: first, status: null },
  null,
])('refuses malformed or mismatched success evidence: %j', async (payload) => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(payload)));
  vi.stubGlobal('fetch', fetcher);
  render(<PaymentReturn apiOrigin={origin} orderId={first} />);
  await screen.findByText(
    'Unable to confirm payment status. Check its saved status before retrying.',
  );
  expect(screen.queryByText('Your placement is complete.')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Check saved payment status' }),
  ).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('serializes explicit POST refresh even before React commits a disabled button', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(first, 'provider_pending'))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
  vi.stubGlobal('fetch', fetcher);
  render(<PaymentReturn apiOrigin={origin} orderId={first} />);
  await screen.findByText('Payment is pending.');
  const button = screen.getByRole('button', { name: 'Refresh payment status' });
  act(() => {
    fireEvent.click(button);
    fireEvent.click(button);
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    `${origin}/payments/orders/${first}/refresh`,
  );
  expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
    method: 'POST',
    body: '{}',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
  });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {
    finish(response(first, 'fulfilled'));
  });
  await screen.findByText('Your placement is complete.');
});

it.each(['lost response', 'wrong order', 'unavailable'] as const)(
  'requires a GET after %s instead of repeating the POST',
  async (failure) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(first, 'provider_pending'));
    if (failure === 'lost response')
      fetcher.mockRejectedValueOnce(Error('synthetic network failure'));
    else if (failure === 'wrong order')
      fetcher.mockResolvedValueOnce(response(second, 'fulfilled'));
    else fetcher.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    fetcher.mockResolvedValueOnce(response(first, 'fulfilled'));
    vi.stubGlobal('fetch', fetcher);
    render(<PaymentReturn apiOrigin={origin} orderId={first} />);
    await screen.findByText('Payment is pending.');
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh payment status' }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check saved payment status' }),
    );
    await screen.findByText('Your placement is complete.');
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual([
      'GET',
      'POST',
      'GET',
    ]);
  },
);

it.each([401, 403, 404, 429, 503])(
  'does not expose an inaccessible/error response (%s)',
  async (status) => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: second,
          status: 'fulfilled',
          raw: 'synthetic-private-provider-data',
        }),
        { status },
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    render(<PaymentReturn apiOrigin={origin} orderId={first} />);
    await screen.findByRole('button', { name: 'Check saved payment status' });
    expect(screen.queryByText('Your placement is complete.')).toBeNull();
    expect(document.body.textContent).not.toContain(
      'synthetic-private-provider-data',
    );
    expect(document.body.textContent).not.toContain(second);
    if (status === 401)
      expect(
        screen
          .getByRole('link', { name: 'Sign in to continue' })
          .getAttribute('href'),
      ).toBe('/me');
  },
);

it('does not retain extra provider fields from a valid response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: first,
          status: 'provider_pending',
          confirmationUrl: 'https://example.invalid/private',
          providerId: 'synthetic-private-provider-data',
        }),
      ),
    ),
  );
  render(<PaymentReturn apiOrigin={origin} orderId={first} />);
  await screen.findByText('Payment is pending.');
  expect(document.body.textContent).not.toContain(
    'synthetic-private-provider-data',
  );
  expect(screen.queryByRole('link', { name: /provider/i })).toBeNull();
});

it('aborts on API origin changes and cannot reuse a success from the old origin', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation((url: string) =>
    url.startsWith(origin)
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(response(first, 'provider_pending')),
  );
  vi.stubGlobal('fetch', fetcher);
  const view = render(<PaymentReturn apiOrigin={origin} orderId={first} />);
  const oldSignal = fetcher.mock.calls[0]?.[1]?.signal as AbortSignal;
  view.rerender(
    <PaymentReturn
      apiOrigin="https://other-api.example.test"
      orderId={first}
    />,
  );
  await screen.findByText('Payment is pending.');
  await act(async () => {
    finish(response(first, 'fulfilled'));
  });
  expect(oldSignal.aborted).toBe(true);
  expect(screen.getByRole('status').textContent).toBe('Payment is pending.');
});

it('clears an old success immediately while the next order is loading', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(first, 'fulfilled'))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
  vi.stubGlobal('fetch', fetcher);
  const view = render(<PaymentReturn apiOrigin={origin} orderId={first} />);
  await screen.findByText('Your placement is complete.');
  view.rerender(<PaymentReturn apiOrigin={origin} orderId={second} />);
  expect(screen.getByRole('status').textContent).toBe('Checking payment…');
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {
    finish(response(second, 'provider_pending'));
  });
});

it('cancels the request on unmount and ignores its late result', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const view = render(<PaymentReturn apiOrigin={origin} orderId={first} />);
  const signal = fetcher.mock.calls[0]?.[1]?.signal as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    finish(response(first, 'fulfilled'));
  });
  expect(screen.queryByRole('status')).toBeNull();
});

it('ignores an obsolete response whose JSON body finishes after the order changes', async () => {
  let finishBody!: (value: unknown) => void;
  let reading = false;
  const body = new Promise((resolve) => {
    finishBody = resolve;
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => {
        reading = true;
        return body;
      },
    })
    .mockResolvedValueOnce(response(second, 'provider_pending'));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<PaymentReturn apiOrigin={origin} orderId={first} />);
  await waitFor(() => expect(reading).toBe(true));
  view.rerender(<PaymentReturn apiOrigin={origin} orderId={second} />);
  await screen.findByText('Payment is pending.');
  await act(async () => {
    finishBody({ id: first, status: 'fulfilled' });
  });
  expect(screen.getByRole('status').textContent).toBe('Payment is pending.');
});

it('fails closed when a successful HTTP response contains non-JSON HTML', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response('<h1>synthetic-private-error-page</h1>')),
  );
  render(<PaymentReturn apiOrigin={origin} orderId={first} />);
  await screen.findByRole('button', { name: 'Check saved payment status' });
  expect(document.body.textContent).not.toContain(
    'synthetic-private-error-page',
  );
  expect(screen.queryByText('Your placement is complete.')).toBeNull();
});

it.each(['GET', 'POST'] as const)(
  'bounds a stalled %s and recovers through a read',
  async (method) => {
    const fetcher = vi.fn();
    if (method === 'POST')
      fetcher.mockResolvedValueOnce(response(first, 'provider_pending'));
    fetcher
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce(response(first, 'provider_pending'));
    vi.stubGlobal('fetch', fetcher);
    if (method === 'GET') vi.useFakeTimers();
    render(<PaymentReturn apiOrigin={origin} orderId={first} />);
    if (method === 'POST') {
      await screen.findByText('Payment is pending.');
      vi.useFakeTimers();
      fireEvent.click(
        screen.getByRole('button', { name: 'Refresh payment status' }),
      );
    }
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(
      screen.getByRole('button', { name: 'Check saved payment status' }),
    ).toBeTruthy();
    vi.useRealTimers();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check saved payment status' }),
    );
    await screen.findByText('Payment is pending.');
    expect(fetcher.mock.calls.at(-1)?.[1]?.method).toBe('GET');
  },
);

it('shows a Russian paid-but-unfulfilled message without promising a placement', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(response(first, 'paid_but_not_fulfilled')),
  );
  render(
    <LocaleProvider initialLocale="ru">
      <PaymentReturn apiOrigin={origin} orderId={first} />
    </LocaleProvider>,
  );
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain(
      'Требуется ручная проверка',
    ),
  );
  expect(screen.queryByText('Размещение выполнено.')).toBeNull();
});
