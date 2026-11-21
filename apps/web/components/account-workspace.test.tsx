// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { AccountWorkspace } from './account-workspace';
import { WorkspaceNavigation } from './workspace-navigation';
vi.mock('next/navigation', () => ({
  usePathname: () => '/me',
  useRouter: () => ({ refresh: vi.fn() }),
}));
const data = {
  profile: { id: 'creator', displayName: 'My studio', slug: 'my-studio' },
  autographs: [
    {
      id: 'own',
      source: 'canvas',
      status: 'awaiting_moderation',
      createdAt: '2026-10-30T12:00:00Z',
    },
  ],
  walls: [],
  canModerate: false,
  canEditProfile: true,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('shows existing autograph status without creating a replacement or exposing original keys', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)));
  vi.stubGlobal('fetch', fetcher);
  render(
    <AccountWorkspace
      apiOrigin="https://api.example.test"
      section="autographs"
    />,
  );
  expect(await screen.findByText('Awaiting moderation')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Open private preview' }),
  ).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  });
});
it('keeps preferences out of the menu and supports closing with Escape', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(data))),
  );
  render(<WorkspaceNavigation apiOrigin="https://api.example.test" />);
  expect(await screen.findByText('My studio')).toBeTruthy();
  const toggle = screen.getByRole('button', { name: 'Menu' });
  fireEvent.click(toggle);
  expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Moderation' })).toBeNull();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(
    screen.queryByRole('navigation', { name: 'Main navigation' }),
  ).toBeNull();
  expect(document.activeElement).toBe(toggle);
});
it('shows sign-in and public links in guest navigation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 401 })),
  );
  render(<WorkspaceNavigation apiOrigin="https://api.example.test" />);
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  expect(screen.getByRole('link', { name: 'How it works' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'My autographs' })).toBeNull();
  expect(
    screen.getByRole('link', { name: 'Sign in' }).getAttribute('href'),
  ).toBe('/me');
});
it('clears the previous account from navigation when a refreshed session expires', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(data)))
    .mockResolvedValueOnce(new Response('{}', { status: 401 }));
  vi.stubGlobal('fetch', fetcher);
  render(<WorkspaceNavigation apiOrigin="https://api.example.test" />);
  expect(await screen.findByText('My studio')).toBeTruthy();
  fireEvent(window, new Event('destka-workspace-updated'));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('My studio')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  expect(screen.queryByRole('link', { name: 'Create autograph' })).toBeNull();
});
it('does not link an archived Wall to a public endpoint that returns 404', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...data,
          walls: [
            {
              id: 'archived',
              status: 'archived',
              slotCount: 10,
              createdAt: '2026-10-31T09:00:00Z',
            },
          ],
        }),
      ),
    ),
  );
  render(
    <AccountWorkspace apiOrigin="https://api.example.test" section="walls" />,
  );
  expect(await screen.findByText(/Archived/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Open Wall' })).toBeNull();
  expect(
    screen.queryByRole('link', { name: 'Edit Wall appearance' }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Create draft Wall' }),
  ).toBeNull();
});
it('disables public profile editing when the server has not admitted publication', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...data, canEditProfile: false })),
      ),
  );
  render(
    <AccountWorkspace
      apiOrigin="https://api.example.test"
      section="settings"
    />,
  );
  expect(
    await screen.findByText('Profile changes are temporarily unavailable.'),
  ).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it('offers an autograph instead of a dead-end profile setup when Wall creation is closed', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...data,
          profile: null,
          walls: [],
          canEditProfile: false,
        }),
      ),
    ),
  );
  render(
    <AccountWorkspace apiOrigin="https://api.example.test" section="walls" />,
  );
  expect(
    await screen.findByRole('heading', {
      name: 'Wall creation is temporarily unavailable',
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Create autograph' }).getAttribute('href'),
  ).toBe('/autograph/create');
  expect(screen.queryByRole('link', { name: 'Set up profile' })).toBeNull();
});
it('creates a draft explicitly and does not publish it or duplicate a pending request', async () => {
  let finish!: (r: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ...data, autographs: [] })),
    )
    .mockReturnValueOnce(pending)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...data,
          walls: [
            {
              id: 'draft-wall',
              status: 'draft',
              slotCount: 10,
              createdAt: '2026-10-31T09:00:00Z',
            },
          ],
        }),
      ),
    );
  vi.stubGlobal('fetch', fetcher);
  render(
    <AccountWorkspace apiOrigin="https://api.example.test" section="walls" />,
  );
  const create = await screen.findByRole('button', {
    name: 'Create draft Wall',
  });
  expect(screen.queryByRole('spinbutton')).toBeNull();
  fireEvent.click(create);
  fireEvent.click(create);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    'https://api.example.test/creators/creator/walls',
  );
  expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual({});
  finish(new Response('{}', { status: 201 }));
  expect(
    await screen.findByRole('button', { name: 'Publish Wall' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('heading', { name: 'My studio’s Wall' }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole('link', { name: 'Edit Wall appearance' })
      .getAttribute('href'),
  ).toBe('/me/walls/design');
  expect(screen.queryByRole('link', { name: 'Open Wall' })).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Create draft Wall' }),
  ).toBeNull();
});
it.each([
  ['ready', 'Approved'],
  ['moderation_rejected', 'Rejected'],
])(
  'opens the private preview action for backend status %s',
  async (status, label) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...data,
            autographs: [{ ...data.autographs[0], status }],
          }),
        ),
      ),
    );
    render(
      <AccountWorkspace
        apiOrigin="https://api.example.test"
        section="autographs"
      />,
    );
    expect(await screen.findByText(label)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Open private preview' }),
    ).toBeTruthy();
  },
);

const wallId = '11111111-1111-4111-8111-111111111111';
const approvalPreview = {
  assetId: 'cleaned-asset',
  url: 'https://private.example.test/preview',
  expiresAt: '2099-01-01T00:00:00Z',
};

function mockResumedApproval(legalRequired = false) {
  const fetcher = vi.fn<
    (input: string, init?: RequestInit) => Promise<Response>
  >(async (input) => {
    if (input.endsWith('/autographs/own/preview'))
      return new Response(JSON.stringify(approvalPreview));
    if (input.endsWith('/autographs/own/approve'))
      return legalRequired
        ? new Response(
            JSON.stringify({ error: { code: 'FIRST_USE_REQUIRED' } }),
            { status: 409 },
          )
        : new Response(
            JSON.stringify({
              id: 'own',
              status: 'awaiting_moderation',
              approvedAt: '2026-11-14T09:00:00Z',
            }),
          );
    return new Response(
      JSON.stringify({
        ...data,
        autographs: [{ ...data.autographs[0], status: 'awaiting_approval' }],
      }),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

it.each([wallId, undefined])(
  'preserves the optional Wall context when creating or resuming an autograph (%s)',
  async (context) => {
    const fetcher = mockResumedApproval();
    render(
      <AccountWorkspace
        apiOrigin="https://api.example.test"
        section="autographs"
        wallId={context}
      />,
    );
    expect(
      (
        await screen.findByRole('link', { name: 'Create autograph' })
      ).getAttribute('href'),
    ).toBe(context ? `/autograph/create?wall=${context}` : '/autograph/create');
    fireEvent.click(
      screen.getByRole('button', { name: 'Open private preview' }),
    );
    fireEvent.load(
      await screen.findByAltText('Cleaned digital autograph preview'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve and submit for moderation' }),
    );
    expect(
      (
        await screen.findByRole('link', { name: 'Check moderation status' })
      ).getAttribute('href'),
    ).toBe(context ? `/me/autographs?wall=${context}` : '/me/autographs');
    if (context)
      expect(
        screen
          .getByRole('link', { name: 'Back to the Wall' })
          .getAttribute('href'),
      ).toBe(`/walls/${context}`);
    else
      expect(
        screen.queryByRole('link', { name: 'Back to the Wall' }),
      ).toBeNull();
    const approvalCall = fetcher.mock.calls.find(([url]) =>
      url.endsWith('/autographs/own/approve'),
    );
    expect(JSON.parse(approvalCall?.[1]?.body as string)).toEqual({
      reviewedAssetId: approvalPreview.assetId,
    });
  },
);

it.each([wallId, undefined])(
  'returns consent confirmation to the account with its optional Wall context (%s)',
  async (context) => {
    mockResumedApproval(true);
    render(
      <AccountWorkspace
        apiOrigin="https://api.example.test"
        section="autographs"
        wallId={context}
      />,
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open private preview' }),
    );
    fireEvent.load(
      await screen.findByAltText('Cleaned digital autograph preview'),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve and submit for moderation' }),
    );
    const confirmation = await screen.findByRole('link', {
      name: 'Открыть подтверждения в новой вкладке',
    });
    const returnTo = context
      ? `/me/autographs?wall=${context}`
      : '/me/autographs';
    expect(confirmation.getAttribute('href')).toBe(
      `/legal/first-use?returnTo=${encodeURIComponent(returnTo)}`,
    );
  },
);
