// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { CleanedAutographReview } from './cleaned-autograph-review';
import { autographApi, AutographApiError } from '../lib/autograph-api';

const initialPreview = {
  assetId: 'cleaned-original',
  url: 'https://private.test/initial',
  expiresAt: '2099-01-01T00:00:00Z',
};
const approved = {
  status: 'awaiting_moderation' as const,
  approvedAt: '2026-11-14T09:00:00Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('recovers a stuck approval without automatic retry and ignores its late success during a manual retry', async () => {
  vi.useFakeTimers();
  const first = deferred<typeof approved>();
  const retry = deferred<typeof approved>();
  const approve = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(retry.promise)
    .mockResolvedValueOnce(approved);
  const preview = vi.fn(async () => initialPreview);
  const onStartOver = vi.fn();
  const accountPath =
    '/me/autographs?wall=11111111-1111-4111-8111-111111111111';
  render(
    <CleanedAutographReview
      api={{ approve, preview }}
      autographId="autograph-1"
      initialPreview={initialPreview}
      onStartOver={onStartOver}
      studioPath={accountPath}
    />,
  );
  fireEvent.load(screen.getByAltText('Cleaned digital autograph preview'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve and submit for moderation' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Submitting approval…' }));
  expect(approve).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(9_999));
  expect(
    screen.getByRole('button', { name: 'Submitting approval…' }),
  ).toHaveProperty('disabled', true);
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(approve.mock.calls[0]?.[2].aborted).toBe(true);
  expect(approve).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Retry approval' })).toHaveProperty(
    'disabled',
    false,
  );
  expect(
    screen.getByRole('button', { name: 'Refresh private preview' }),
  ).toHaveProperty('disabled', false);
  expect(
    screen.getByRole('button', { name: 'Start a new autograph' }),
  ).toHaveProperty('disabled', false);
  expect(
    screen
      .getByAltText('Cleaned digital autograph preview')
      .getAttribute('src'),
  ).toBe(initialPreview.url);
  fireEvent.click(screen.getByRole('button', { name: 'Retry approval' }));
  await act(async () => first.resolve(approved));
  expect(screen.queryByText('Submitted for moderation')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Submitting approval…' }),
  ).toHaveProperty('disabled', true);
  await act(async () =>
    retry.reject(new AutographApiError('FIRST_USE_REQUIRED', 409)),
  );
  expect(
    screen
      .getByRole('link', { name: 'Открыть подтверждения в новой вкладке' })
      .getAttribute('href'),
  ).toBe(`/legal/first-use?returnTo=${encodeURIComponent(accountPath)}`);
  fireEvent.click(screen.getByRole('button', { name: 'Retry approval' }));
  await act(async () => {});
  expect(screen.getByText('Submitted for moderation')).toBeTruthy();
  expect(approve).toHaveBeenCalledTimes(3);
  for (const call of approve.mock.calls)
    expect(call.slice(0, 2)).toEqual(['autograph-1', initialPreview.assetId]);
  expect(preview).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([undefined, '11111111-1111-4111-8111-111111111111'])(
  'offers the authoritative status after a timed-out approval advances to moderation outcome (%s)',
  async (wallId) => {
    vi.useFakeTimers();
    const first = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'AUTOGRAPH_NOT_AWAITING_APPROVAL' } },
          { status: 409 },
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    render(
      <CleanedAutographReview
        api={autographApi('https://api.test')}
        autographId="autograph-1"
        initialPreview={initialPreview}
        onStartOver={vi.fn()}
        wallId={wallId}
      />,
    );
    fireEvent.load(screen.getByAltText('Cleaned digital autograph preview'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve and submit for moderation' }),
    );
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    fireEvent.click(screen.getByRole('button', { name: 'Retry approval' }));
    await act(async () => {});

    expect(
      screen
        .getByRole('link', { name: 'Check moderation status' })
        .getAttribute('href'),
    ).toBe(wallId ? `/me/autographs?wall=${wallId}` : '/me/autographs');
    expect(screen.getByRole('alert').textContent).toBe(
      'The status of this autograph has changed.',
    );
    expect(screen.queryByRole('button', { name: 'Retry approval' })).toBeNull();
    expect(
      screen.queryByRole('button', {
        name: 'Approve and submit for moderation',
      }),
    ).toBeNull();
    expect(screen.queryByText('Submitted for moderation')).toBeNull();
    await act(async () => first.resolve(Response.json(approved)));
    expect(screen.queryByText('Submitted for moderation')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('recovers a stuck refresh, discards its late asset, and requires the retried preview image to load', async () => {
  vi.useFakeTimers();
  const first = deferred<typeof initialPreview>();
  const retry = deferred<typeof initialPreview>();
  const preview = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(retry.promise);
  const approve = vi.fn(async () => approved);
  render(
    <CleanedAutographReview
      api={{ approve, preview }}
      autographId="autograph-1"
      initialPreview={initialPreview}
      onStartOver={vi.fn()}
    />,
  );
  fireEvent.load(screen.getByAltText('Cleaned digital autograph preview'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh private preview' }),
  );
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(preview.mock.calls[0]?.[1].aborted).toBe(true);
  expect(preview).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert').textContent).toContain(
    'Could not refresh the private preview. Try again.',
  );
  expect(
    screen.getByRole('button', { name: 'Approve and submit for moderation' }),
  ).toHaveProperty('disabled', false);
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh private preview' }),
  );
  await act(async () =>
    first.resolve({
      ...initialPreview,
      assetId: 'stale',
      url: 'https://private.test/stale',
    }),
  );
  expect(
    screen
      .getByAltText('Cleaned digital autograph preview')
      .getAttribute('src'),
  ).toBe(initialPreview.url);
  expect(
    screen.getByRole('button', { name: 'Refreshing preview…' }),
  ).toHaveProperty('disabled', true);
  const current = {
    ...initialPreview,
    assetId: 'cleaned-current',
    url: 'https://private.test/current',
  };
  await act(async () => retry.resolve(current));
  expect(
    screen.getByRole('button', { name: 'Approve and submit for moderation' }),
  ).toHaveProperty('disabled', true);
  expect(
    screen
      .getByAltText('Cleaned digital autograph preview')
      .getAttribute('src'),
  ).toBe(current.url);
  fireEvent.load(screen.getByAltText('Cleaned digital autograph preview'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve and submit for moderation' }),
  );
  await act(async () => {});
  expect(approve).toHaveBeenCalledWith(
    'autograph-1',
    current.assetId,
    expect.any(AbortSignal),
  );
  expect(screen.getByText('Submitted for moderation')).toBeTruthy();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['approval', 'refresh'] as const)(
  'aborts a pending %s on unmount and cleans its deadline even when the API ignores cancellation',
  async (kind) => {
    vi.useFakeTimers();
    const pendingApproval = deferred<typeof approved>();
    const pendingPreview = deferred<typeof initialPreview>();
    const approve = vi.fn().mockReturnValue(pendingApproval.promise);
    const preview = vi.fn().mockReturnValue(pendingPreview.promise);
    const view = render(
      <CleanedAutographReview
        api={{ approve, preview }}
        autographId="autograph-1"
        initialPreview={initialPreview}
        onStartOver={vi.fn()}
      />,
    );
    fireEvent.load(screen.getByAltText('Cleaned digital autograph preview'));
    fireEvent.click(
      screen.getByRole('button', {
        name:
          kind === 'approval'
            ? 'Approve and submit for moderation'
            : 'Refresh private preview',
      }),
    );
    const signal =
      kind === 'approval'
        ? approve.mock.calls[0]?.[2]
        : preview.mock.calls[0]?.[1];
    expect(signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    await act(async () => {});
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      pendingApproval.resolve(approved);
      pendingPreview.resolve(initialPreview);
    });
    expect(screen.queryByText('Submitted for moderation')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it('bounds an approval response whose JSON body ignores abort and recovers with the same reviewed asset', async () => {
  vi.useFakeTimers();
  const body = deferred<typeof approved>();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: () => body.promise })
    .mockResolvedValueOnce(new Response(JSON.stringify(approved)));
  vi.stubGlobal('fetch', fetcher);
  render(
    <CleanedAutographReview
      api={autographApi('https://api.test')}
      autographId="autograph-1"
      initialPreview={initialPreview}
      onStartOver={vi.fn()}
    />,
  );
  fireEvent.load(screen.getByAltText('Cleaned digital autograph preview'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Approve and submit for moderation' }),
  );
  await act(() => vi.advanceTimersByTimeAsync(10_000));
  expect(fetcher.mock.calls[0]?.[1].signal.aborted).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry approval' }));
  await act(async () => {});
  expect(screen.getByText('Submitted for moderation')).toBeTruthy();
  await act(async () => body.reject(new Error('late body failure')));
  expect(screen.getByText('Submitted for moderation')).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [, options] of fetcher.mock.calls)
    expect(JSON.parse(options.body)).toEqual({
      reviewedAssetId: initialPreview.assetId,
    });
  expect(vi.getTimerCount()).toBe(0);
});
