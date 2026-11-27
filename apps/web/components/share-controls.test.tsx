// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { ShareControls } from './share-controls';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'clipboard');
});

const original = {
  apiOrigin: 'https://api.test',
  wallId: 'wall-a',
  slots: [{ id: 'slot-a', position: 0 }],
};
const create = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Create share card' }));

it('resets an old link and selected slot when the Wall changes without issuing a write', async () => {
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ id: 'old-share' })),
  );
  vi.stubGlobal('fetch', fetcher);
  const view = render(<ShareControls {...original} />);
  fireEvent.change(screen.getByLabelText('Your slot'), {
    target: { value: 'slot-a' },
  });
  await act(async () => {
    create();
  });
  expect(screen.getByText('Open share card')).toBeTruthy();
  view.rerender(
    <ShareControls
      {...original}
      wallId="wall-b"
      slots={[{ id: 'slot-b', position: 1 }]}
    />,
  );
  expect(screen.queryByText('Open share card')).toBeNull();
  expect((screen.getByLabelText('Your slot') as HTMLSelectElement).value).toBe(
    '',
  );
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each(['origin', 'wall', 'unmount'])(
  'cancels a pending create after %s change and ignores its late success',
  async (change) => {
    let release!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const view = render(<ShareControls {...original} />);
    await act(async () => {
      create();
    });
    if (change === 'unmount') view.unmount();
    else
      view.rerender(
        <ShareControls
          {...original}
          apiOrigin={
            change === 'origin' ? 'https://other.test' : original.apiOrigin
          }
          wallId={change === 'wall' ? 'wall-b' : original.wallId}
        />,
      );
    try {
      expect(fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    } finally {
      await act(async () =>
        release(new Response(JSON.stringify({ id: 'old-share' }))),
      );
    }
    expect(screen.queryByText('Open share card')).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  },
);

it('serializes two submissions in one React batch without a duplicate POST', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetcher = vi.fn(async () => {
    await gate;
    return new Response(JSON.stringify({ id: 'share' }));
  });
  vi.stubGlobal('fetch', fetcher);
  render(<ShareControls {...original} />);
  await act(async () => {
    const form = screen
      .getByRole('button', { name: 'Create share card' })
      .closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  try {
    expect(fetcher).toHaveBeenCalledOnce();
  } finally {
    await act(async () => release());
  }
});

it('does not start a clipboard fallback after leaving the original sharing context', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ id: 'old-share' }))),
  );
  let rejectShare!: (reason: Error) => void;
  const nativeShare = vi.fn(
    () =>
      new Promise<void>((_, reject) => {
        rejectShare = reject;
      }),
  );
  const copy = vi.fn(async () => {});
  Object.defineProperty(navigator, 'share', {
    value: nativeShare,
    configurable: true,
  });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: copy },
    configurable: true,
  });
  const view = render(<ShareControls {...original} />);
  await act(async () => {
    create();
  });
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Share or copy link' })),
  );
  expect(nativeShare).toHaveBeenCalledOnce();
  view.rerender(<ShareControls {...original} wallId="wall-b" />);
  await act(async () => rejectShare(new Error('Sharing unavailable')));
  expect(copy).not.toHaveBeenCalled();
  expect(screen.queryByText('Link copied.')).toBeNull();
});
import { cleanup } from '@testing-library/react';
it('creates a fixed-text card without arbitrary publication fields and provides a copy fallback', async () => {
  const request = vi.fn(
    async () => new Response(JSON.stringify({ id: 'public-share' })),
  );
  vi.stubGlobal('fetch', request);
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: copy },
    configurable: true,
  });
  Object.defineProperty(navigator, 'share', {
    value: undefined,
    configurable: true,
  });
  render(
    <ShareControls
      apiOrigin="https://api.test"
      wallId="wall"
      slots={[{ id: 'slot', position: 0 }]}
    />,
  );
  fireEvent.change(screen.getByLabelText('Your slot'), {
    target: { value: 'slot' },
  });
  expect(screen.queryByLabelText('Public username (optional)')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Create share card' }));
  await screen.findByText('Open share card');
  expect(
    JSON.parse(
      (request.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    ),
  ).toEqual({ wallId: 'wall', slotId: 'slot' });
  fireEvent.click(screen.getByRole('button', { name: 'Share or copy link' }));
  await screen.findByText('Link copied.');
  expect(copy).toHaveBeenCalledWith(expect.stringContaining('/s/public-share'));
  expect(request.mock.calls.length).toBe(2);
});
