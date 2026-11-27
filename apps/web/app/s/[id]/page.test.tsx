import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page, { generateMetadata } from './page';

vi.mock('../../../lib/i18n-server', () => ({
  getTranslator: async () => (key: string) => key,
}));
vi.mock('@digital-autograph/config', () => ({
  loadWebConfig: () => ({
    API_INTERNAL_URL: 'http://api.test',
    API_PUBLIC_ORIGIN: 'http://api.test',
  }),
}));
afterEach(() => vi.unstubAllGlobals());

it('withholds a legacy alias from page text and social metadata even with an older API', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id,
            wallId: id,
            slotId: id,
            slotNumber: 1,
            creator: 'Synthetic creator',
            publicAlias: 'Synthetic_channel',
            event: 'slot_claimed',
          }),
        ),
    ),
  );
  const props = { params: Promise.resolve({ id }) };
  const html = renderToStaticMarkup(await Page(props));
  expect(html).not.toContain('Synthetic_channel');
  expect(html).toContain('Synthetic creator');
  expect(html).toContain(`/walls/${id}#slot-${id}`);
  const metadata = await generateMetadata(props);
  expect(JSON.stringify(metadata)).not.toContain('Synthetic_channel');
  expect(metadata.description).toBe('View this digital autograph Wall.');
});
