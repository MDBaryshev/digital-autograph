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
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(document.activeElement).toBe(toggle);
});
it('does not advertise creating an autograph to a guest', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 401 })),
  );
  render(<WorkspaceNavigation apiOrigin="https://api.example.test" />);
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  expect(screen.queryByRole('link', { name: 'Create autograph' })).toBeNull();
  expect(
    screen
      .getByRole('link', { name: 'Sign in to continue' })
      .getAttribute('href'),
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
              slotCount: 3,
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
              slotCount: 12,
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
  fireEvent.change(await screen.findByLabelText('Number of places'), {
    target: { value: '12' },
  });
  const create = screen.getByRole('button', { name: 'Create draft Wall' });
  fireEvent.click(create);
  fireEvent.click(create);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    'https://api.example.test/creators/creator/walls',
  );
  expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual({
    slotCount: 12,
  });
  finish(new Response('{}', { status: 201 }));
  expect(
    await screen.findByRole('button', { name: 'Publish Wall' }),
  ).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Open Wall' })).toBeNull();
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
