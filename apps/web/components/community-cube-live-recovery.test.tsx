// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { CommunityCubeLive } from './community-cube-live';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const origin = 'https://api.example.test';
const autographId = '00000000-0000-4000-8000-000000000001';
const placement = {
  id: '00000000-0000-4000-8000-000000000002',
  autographId,
  cell: 1,
};
const cube = { generation: 1, capacity: 24, occupiedCells: [] };
const choices = {
  items: [
    { id: autographId, source: 'canvas', moderatedAt: '2026-11-20T12:00:00Z' },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function stalledResponse(
  stage: string,
  late: ReturnType<typeof deferred<Response>>,
) {
  return stage === 'headers'
    ? late.promise
    : Promise.resolve({
        ok: true,
        status: 200,
        json: () => late.promise.then((response) => response.json()),
      });
}

it.each(
  ['cube', 'placement', 'choices'].flatMap((read) =>
    ['headers', 'body'].map((stage) => ({ read, stage })),
  ),
)(
  'recovers a stalled $read $stage read and ignores its late response after explicit refresh',
  async ({ read, stage }) => {
    vi.useFakeTimers();
    const late = deferred<Response>();
    const path =
      read === 'cube'
        ? '/community-cube'
        : read === 'placement'
          ? '/me/community-cube'
          : '/autographs?status=ready';
    let stalled = false;
    const fetcher = vi.fn((url: string) => {
      if (url === origin + path && !stalled) {
        stalled = true;
        return stalledResponse(stage, late);
      }
      if (
        url.endsWith('/community-cube') &&
        !url.endsWith('/me/community-cube')
      )
        return Promise.resolve(Response.json(cube));
      if (url.endsWith('/me/community-cube'))
        return Promise.resolve(Response.json({ placement: null }));
      if (url.endsWith('/autographs?status=ready'))
        return Promise.resolve(Response.json(choices));
      throw Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetcher);
    await act(async () => {
      render(<CommunityCubeLive apiOrigin={origin} />);
    });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    const refresh = screen.getByRole('button', {
      name: 'Refresh cube',
    }) as HTMLButtonElement;
    expect(refresh.disabled).toBe(false);
    const before = fetcher.mock.calls.length;
    await act(async () => {
      fireEvent.click(refresh);
    });
    expect(fetcher.mock.calls.length).toBeGreaterThan(before);
    expect(screen.getByRole('radio')).toBeTruthy();
    await act(async () =>
      late.resolve(
        Response.json(
          read === 'cube'
            ? { ...cube, occupiedCells: [1] }
            : read === 'placement'
              ? { placement }
              : { items: [] },
        ),
      ),
    );
    expect(screen.getByRole('radio')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Place 1 · Free' })).toBeTruthy();
  },
);

it.each(['headers', 'body'])(
  'reconciles a publish with stalled %s before allowing an exact-request explicit retry',
  async (stage) => {
    vi.useFakeTimers();
    const late = deferred<Response>();
    const reconcile = deferred<Response>();
    let reads = 0;
    let writes = 0;
    const fetcher = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        writes++;
        return writes === 1
          ? stalledResponse(stage, late)
          : Promise.resolve(Response.json({ placement }));
      }
      if (url === origin + '/community-cube')
        return Promise.resolve(Response.json(cube));
      if (url === origin + '/me/community-cube') {
        reads++;
        return reads === 2
          ? reconcile.promise
          : Promise.resolve(
              Response.json({
                placement: reads > 2 && writes > 1 ? placement : null,
              }),
            );
      }
      if (url.endsWith('/autographs?status=ready'))
        return Promise.resolve(Response.json(choices));
      if (url.endsWith('/preview'))
        return Promise.resolve(
          Response.json({
            url: origin + '/private-preview',
            expiresAt: '2099-01-01T00:00:00.000Z',
          }),
        );
      throw Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetcher);
    await act(async () => {
      render(<CommunityCubeLive apiOrigin={origin} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('radio'));
      fireEvent.click(screen.getByRole('button', { name: 'Place 1 · Free' }));
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Publish autograph' }),
      );
    });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole('alert').textContent).toContain(
      'Could not confirm the change',
    );
    expect(writes).toBe(1);
    expect(
      (
        screen.getByRole('button', {
          name: 'Publish autograph',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () =>
      reconcile.resolve(Response.json({ placement: null })),
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Publish autograph' }),
      );
    });
    expect(writes).toBe(2);
    const mutations = fetcher.mock.calls.filter(
      ([, options]) => options?.method === 'POST',
    );
    expect(mutations[1]![1]?.body).toBe(mutations[0]![1]?.body);
    expect(mutations[0]![1]?.signal?.aborted).toBe(true);
    await act(async () =>
      late.resolve(Response.json({ placement: { ...placement, cell: 2 } })),
    );
    expect(
      screen.getByText('Your autograph is saved at place 1.'),
    ).toBeTruthy();
    expect(
      screen.queryByText('Your autograph is saved at place 2.'),
    ).toBeNull();
  },
);

it.each(['headers', 'body'])(
  'reconciles a withdrawal with stalled %s without automatically replaying DELETE',
  async (stage) => {
    vi.useFakeTimers();
    const late = deferred<Response>();
    let withdrawn = false;
    let writes = 0;
    const fetcher = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') {
        writes++;
        withdrawn = true;
        return stalledResponse(stage, late);
      }
      if (url === origin + '/community-cube')
        return Promise.resolve(Response.json(cube));
      if (url === origin + '/me/community-cube')
        return Promise.resolve(
          Response.json({ placement: withdrawn ? null : placement }),
        );
      if (url.endsWith('/autographs?status=ready'))
        return Promise.resolve(Response.json(choices));
      throw Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetcher);
    await act(async () => {
      render(<CommunityCubeLive apiOrigin={origin} />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw autograph' }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Confirm withdrawal' }),
      );
    });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.getByRole('alert').textContent).toContain(
      'Could not confirm the change',
    );
    expect(
      screen.queryByText('Your autograph is saved at place 1.'),
    ).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: 'Refresh cube',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    await act(async () => late.resolve(Response.json({})));
    expect(writes).toBe(1);
    expect(screen.queryByText('Your autograph was withdrawn.')).toBeNull();
  },
);
