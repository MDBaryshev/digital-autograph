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
import { AccountWorkspace } from './account-workspace';
import { OwnerRejectionDetails } from './owner-rejection-details';
import { LocaleProvider } from './locale-provider';

const id = '11111111-1111-4111-8111-111111111111';
const origin = 'https://api.example.test';
const rejected = {
  id,
  status: 'moderation_rejected',
  moderation: {
    decision: 'rejected',
    reasonCode: 'NOT_AN_AUTOGRAPH',
    decidedAt: '2026-11-12T09:00:00.000Z',
  },
  original: { storageKey: 'private-original-never-render' },
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mountDetail(autographId = id, apiOrigin = origin) {
  return render(
    <OwnerRejectionDetails apiOrigin={apiOrigin} autographId={autographId} />,
  );
}

it.each([
  ['SEXUAL_CONTENT', 'Explicit sexual content'],
  ['HATE_OR_EXTREMISM', 'Hate or extremist content'],
  ['THREATS_OR_VIOLENCE', 'Threats or graphic violence'],
  ['PERSONAL_DATA', 'Sensitive personal data'],
  ['IMPERSONATION_OR_DECEPTIVE', 'Deceptive impersonation'],
  ['ILLEGAL_OR_PROHIBITED', 'Illegal or prohibited content'],
  ['NOT_AN_AUTOGRAPH', 'Not an autograph'],
  ['OTHER_POLICY_VIOLATION', 'Other policy violation'],
])('reads existing %s only on explicit request', async (reasonCode, label) => {
  const fetcher = vi.fn().mockResolvedValue(
    response({
      ...rejected,
      moderation: { ...rejected.moderation, reasonCode },
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  mountDetail();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'View rejection details' }),
  );
  expect(await screen.findByText(label)).toBeTruthy();
  expect(
    screen
      .getByText((_, node) => node?.tagName === 'TIME')
      ?.getAttribute('datetime'),
  ).toBe(rejected.moderation.decidedAt);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([
  null,
  { ...rejected, id: '22222222-2222-4222-8222-222222222222' },
  { ...rejected, status: 'ready' },
  { ...rejected, status: 'unknown' },
  { ...rejected, moderation: { ...rejected.moderation, decision: 'approved' } },
  {
    ...rejected,
    moderation: { ...rejected.moderation, reasonCode: 'RAW-PRIVATE-VALUE' },
  },
  {
    ...rejected,
    moderation: {
      ...rejected.moderation,
      decidedAt: '2026-02-31T09:00:00.000Z',
    },
  },
  {
    ...rejected,
    moderation: { ...rejected.moderation, decidedAt: 'not-a-date' },
  },
])('rejects malformed, mismatched or non-rejected detail %j', async (value) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(value)));
  mountDetail();
  fireEvent.click(
    screen.getByRole('button', { name: 'View rejection details' }),
  );
  await screen.findByRole('alert');
  expect(screen.queryByText('Not an autograph')).toBeNull();
  expect(screen.queryByText('RAW-PRIVATE-VALUE')).toBeNull();
  expect(screen.queryByText('private-original-never-render')).toBeNull();
});

it('does not send an invalid identifier to the API', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  mountDetail('../other-account');
  fireEvent.click(
    screen.getByRole('button', { name: 'View rejection details' }),
  );
  await screen.findByRole('alert');
  expect(fetcher).not.toHaveBeenCalled();
});

it('handles a successful response with invalid JSON without exposing its body', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('private-invalid-json')),
  );
  mountDetail();
  fireEvent.click(
    screen.getByRole('button', { name: 'View rejection details' }),
  );
  await screen.findByRole('alert');
  expect(screen.queryByText('private-invalid-json')).toBeNull();
});

it('closing an in-flight read aborts it and a late response cannot reopen the details', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  mountDetail();
  fireEvent.click(
    screen.getByRole('button', { name: 'View rejection details' }),
  );
  const signal = fetcher.mock.calls[0]?.[1]?.signal as AbortSignal;
  fireEvent.click(
    screen.getByRole('button', { name: 'Close rejection details' }),
  );
  expect(signal.aborted).toBe(true);
  await act(async () => {
    finish(response(rejected));
  });
  expect(screen.queryByText('Not an autograph')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'View rejection details' }),
  ).toBeTruthy();
});

it.each([401, 403, 404])(
  'handles %s without exposing error payloads or a retry control',
  async (status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response({ error: { code: 'private-server-detail' } }, status),
      );
    vi.stubGlobal('fetch', fetcher);
    mountDetail();
    fireEvent.click(
      screen.getByRole('button', { name: 'View rejection details' }),
    );
    await screen.findByRole('alert');
    expect(screen.queryByText('private-server-detail')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Retry rejection details' }),
    ).toBeNull();
    if (status === 401)
      expect(
        screen
          .getByRole('link', { name: 'Sign in to continue' })
          .getAttribute('href'),
      ).toBe('/me');
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it('retries only the owner GET after a transport failure', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(Error('private-transport'))
    .mockResolvedValueOnce(response(rejected));
  vi.stubGlobal('fetch', fetcher);
  mountDetail();
  fireEvent.click(
    screen.getByRole('button', { name: 'View rejection details' }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry rejection details' }),
  );
  await screen.findByText('Not an autograph');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.every((call) => call[1].method === 'GET')).toBe(
    true,
  );
  expect(screen.queryByText('private-transport')).toBeNull();
});

it('bounds even an abort-ignoring request and ignores its late result after retry', async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(
      response({
        ...rejected,
        moderation: { ...rejected.moderation, reasonCode: 'PERSONAL_DATA' },
      }),
    );
  vi.stubGlobal('fetch', fetcher);
  mountDetail();
  vi.useFakeTimers();
  fireEvent.click(
    screen.getByRole('button', { name: 'View rejection details' }),
  );
  const signal = fetcher.mock.calls[0]?.[1]?.signal as AbortSignal;
  await act(() => vi.advanceTimersByTimeAsync(15_000));
  expect(signal.aborted).toBe(true);
  expect(
    screen.getByRole('button', { name: 'Retry rejection details' }),
  ).toBeTruthy();
  vi.useRealTimers();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry rejection details' }),
  );
  await screen.findByText('Sensitive personal data');
  await act(async () => {
    finish(response(rejected));
  });
  expect(screen.queryByText('Not an autograph')).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each(['id', 'origin'] as const)(
  'clears private state and ignores stale responses when %s changes',
  async (changed) => {
    let finish!: (value: Response) => void;
    const nextId = '22222222-2222-4222-8222-222222222222';
    const nextOrigin = 'https://other-api.example.test';
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(
        response({
          ...rejected,
          id: changed === 'id' ? nextId : id,
          moderation: { ...rejected.moderation, reasonCode: 'PERSONAL_DATA' },
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    const view = mountDetail();
    fireEvent.click(
      screen.getByRole('button', { name: 'View rejection details' }),
    );
    const signal = fetcher.mock.calls[0]?.[1]?.signal as AbortSignal;
    view.rerender(
      <OwnerRejectionDetails
        apiOrigin={changed === 'origin' ? nextOrigin : origin}
        autographId={changed === 'id' ? nextId : id}
      />,
    );
    expect(signal.aborted).toBe(true);
    expect(
      screen.getByRole('button', { name: 'View rejection details' }),
    ).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'View rejection details' }),
    );
    await screen.findByText('Sensitive personal data');
    await act(async () => {
      finish(response(rejected));
    });
    expect(screen.queryByText('Not an autograph')).toBeNull();
  },
);

it('aborts on close and unmount, clears prior details before reopening, and handles access loss', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(rejected))
    .mockResolvedValueOnce(response({}, 403));
  vi.stubGlobal('fetch', fetcher);
  const view = mountDetail();
  fireEvent.click(
    screen.getByRole('button', { name: 'View rejection details' }),
  );
  await screen.findByText('Not an autograph');
  fireEvent.click(
    screen.getByRole('button', { name: 'Close rejection details' }),
  );
  expect(screen.queryByText('Not an autograph')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'View rejection details' }),
  );
  await screen.findByRole('alert');
  expect(screen.queryByText('Not an autograph')).toBeNull();
  view.unmount();
  const hanging = vi.fn().mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal('fetch', hanging);
  const pending = mountDetail();
  fireEvent.click(
    screen.getByRole('button', { name: 'View rejection details' }),
  );
  const signal = hanging.mock.calls[0]?.[1]?.signal as AbortSignal;
  pending.unmount();
  expect(signal.aborted).toBe(true);
});

it('renders the same stable reason and date in Russian without new policy wording', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(rejected)));
  render(
    <LocaleProvider initialLocale="ru">
      <OwnerRejectionDetails apiOrigin={origin} autographId={id} />
    </LocaleProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Посмотреть причину отклонения' }),
  );
  expect(await screen.findByText('Не является автографом')).toBeTruthy();
  expect(
    screen.getByRole('region', { name: 'Подробности отклонения' }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole('link', { name: 'Начать новый автограф' })
      .getAttribute('href'),
  ).toBe('/autograph/create');
  expect(
    screen
      .getByText((_, node) => node?.tagName === 'TIME')
      .getAttribute('datetime'),
  ).toBe(rejected.moderation.decidedAt);
});

it('does not offer rejection detail for an approved autograph', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    response({
      profile: null,
      walls: [],
      autographs: [
        {
          id,
          source: 'canvas',
          status: 'ready',
          createdAt: rejected.moderation.decidedAt,
        },
      ],
      canModerate: false,
      canEditProfile: false,
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  render(<AccountWorkspace apiOrigin={origin} section="autographs" />);
  await screen.findByText('Approved');
  expect(
    screen.queryByRole('button', { name: 'View rejection details' }),
  ).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('aborts a detail read when a refreshed workspace removes the previous account autograph', async () => {
  let finish!: (value: Response) => void;
  const workspace = {
    profile: null,
    walls: [],
    canModerate: false,
    canEditProfile: false,
    autographs: [
      {
        id,
        source: 'canvas',
        status: 'moderation_rejected',
        createdAt: rejected.moderation.decidedAt,
      },
    ],
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(workspace))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(response({ ...workspace, autographs: [] }));
  vi.stubGlobal('fetch', fetcher);
  render(<AccountWorkspace apiOrigin={origin} section="autographs" />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'View rejection details' }),
  );
  const signal = fetcher.mock.calls[1]?.[1]?.signal as AbortSignal;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await screen.findByText(
    'No autographs yet. Start with a drawing or a photo.',
  );
  await waitFor(() => expect(signal.aborted).toBe(true));
  await act(async () => {
    finish(response(rejected));
  });
  expect(screen.queryByText('Not an autograph')).toBeNull();
  expect(
    screen.queryByRole('region', { name: 'Rejection details' }),
  ).toBeNull();
});

it('lets the owner read the existing rejection reason from the autograph list without a write', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      response({
        profile: null,
        walls: [],
        canModerate: false,
        canEditProfile: false,
        autographs: [
          {
            id,
            source: 'canvas',
            status: 'moderation_rejected',
            createdAt: '2026-11-11T12:00:00.000Z',
          },
        ],
      }),
    )
    .mockResolvedValueOnce(response(rejected));
  vi.stubGlobal('fetch', fetcher);
  render(<AccountWorkspace apiOrigin={origin} section="autographs" />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'View rejection details' }),
  );
  expect(await screen.findByText('Not an autograph')).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Start a new autograph' }),
  ).toHaveProperty('pathname', '/autograph/create');
  expect(screen.queryByText('private-original-never-render')).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]).toMatchObject([
    `${origin}/autographs/${id}`,
    { method: 'GET', credentials: 'include', cache: 'no-store' },
  ]);
});
