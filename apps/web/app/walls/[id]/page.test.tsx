import { afterEach, describe, expect, it, vi } from 'vitest';
import WallPage, { generateMetadata } from './page';

vi.mock('@digital-autograph/config', () => ({
  loadWebConfig: () => ({
    API_INTERNAL_URL: 'http://internal-api:4000',
    API_PUBLIC_ORIGIN: 'https://api.example.test',
  }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

const id = '00000000-0000-4000-8000-000000000001';

afterEach(() => vi.unstubAllGlobals());

describe('public Wall server page', () => {
  it('loads initial public Wall from the internal API and passes only the public origin to browser UI', async () => {
    const wall = { id, status: 'live', slots: [] };
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(
      async () => new Response(JSON.stringify(wall), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const page = await WallPage({ params: Promise.resolve({ id }) });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `http://internal-api:4000/walls/${id}`,
    );
    expect(page.props).toMatchObject({
      initialWall: wall,
      apiOrigin: 'https://api.example.test',
    });
    expect(JSON.stringify(page.props)).not.toContain('internal-api');
  });

  it('returns Not Found for unknown or malformed Wall IDs', async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(
      async () => new Response(null, { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(WallPage({ params: Promise.resolve({ id }) })).rejects.toThrow(
      'NOT_FOUND',
    );
    await expect(
      WallPage({ params: Promise.resolve({ id: 'bad' }) }),
    ).rejects.toThrow('NOT_FOUND');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'en' }) }),
}));

it('exposes only the public invitation image origin in social metadata', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id,
          creator: { displayName: 'Creator' },
          appearance: { title: 'My ten', description: 'Public description' },
        }),
      ),
    ),
  );
  const metadata = await generateMetadata({ params: Promise.resolve({ id }) });
  expect(metadata.title).toBe('My ten');
  expect(JSON.stringify(metadata)).toContain(
    'https://api.example.test/walls/' + id + '/invite-card?locale=en',
  );
  expect(JSON.stringify(metadata)).not.toContain('internal-api');
});
