import { expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  normalizeAppearanceImage,
  importProviderAvatar,
} from './appearance-images';

it('normalizes raster uploads to bounded JPEG crops without original metadata', async () => {
  const png = await sharp({
    create: { width: 800, height: 600, channels: 3, background: '#def' },
  })
    .withMetadata({ exif: { IFD0: { Artist: 'private-original' } } })
    .png()
    .toBuffer();
  for (const kind of ['avatar', 'cover'] as const) {
    const result = await normalizeAppearanceImage(
      'data:image/png;base64,' + png.toString('base64'),
      kind,
    );
    const bytes = Buffer.from(result.split(',')[1]!, 'base64');
    const meta = await sharp(bytes).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(
      kind === 'avatar' ? ['jpeg', 256, 256] : ['jpeg', 1200, 400],
    );
    expect(meta.exif).toBeUndefined();
    expect(bytes.length).toBeLessThanOrEqual(262144);
  }
  for (const value of [
    'https://example.com/a.png',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/jpeg;base64,' + png.toString('base64'),
    'data:image/png;base64,' + Buffer.alloc(262145).toString('base64'),
  ])
    await expect(normalizeAppearanceImage(value, 'avatar')).rejects.toThrow(
      'INVALID_APPEARANCE_IMAGE',
    );
});
it('only fetches verified-provider HTTPS hosts and refuses redirects, oversized bodies and unsupported types', async () => {
  const fetcher = vi.fn<typeof fetch>();
  for (const url of [
    'http://lh3.googleusercontent.com/a',
    'https://lh3.googleusercontent.com.evil.test/a',
    'https://127.0.0.1/a',
    'https://user:pass@lh3.googleusercontent.com/a',
    'https://lh3.googleusercontent.com:444/a',
  ])
    expect(await importProviderAvatar('google', url, fetcher)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  const png = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
  fetcher.mockResolvedValueOnce(
    new Response(png, { headers: { 'Content-Type': 'image/png' } }),
  );
  expect(
    await importProviderAvatar(
      'google',
      'https://lh3.googleusercontent.com/a',
      fetcher,
    ),
  ).toMatch(/^data:image\/jpeg;base64,/);
  expect(fetcher.mock.calls[0]![1]?.redirect).toBe('error');
  fetcher.mockResolvedValueOnce(
    new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
  );
  expect(
    await importProviderAvatar(
      'google',
      'https://lh3.googleusercontent.com/a',
      fetcher,
    ),
  ).toBeNull();
  fetcher.mockResolvedValueOnce(
    new Response(Buffer.alloc(262145), {
      headers: { 'Content-Type': 'image/png' },
    }),
  );
  expect(
    await importProviderAvatar(
      'google',
      'https://lh3.googleusercontent.com/a',
      fetcher,
    ),
  ).toBeNull();
});

it('imports the Telegram Login avatar CDN only for Telegram identities', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const picture = 'https://cdn4.telesco.pe/file/example';
  expect(await importProviderAvatar('google', picture, fetcher)).toBeNull();
  for (const url of [
    'http://cdn4.telesco.pe/file/example',
    'https://cdn4.telesco.pe.evil.test/file/example',
    'https://other.telesco.pe/file/example',
    'https://user:pass@cdn4.telesco.pe/file/example',
    'https://cdn4.telesco.pe:444/file/example',
  ]) {
    expect(await importProviderAvatar('telegram', url, fetcher)).toBeNull();
  }
  expect(fetcher).not.toHaveBeenCalled();

  const jpeg = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#fff' },
  })
    .jpeg()
    .toBuffer();
  fetcher.mockResolvedValueOnce(
    new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } }),
  );
  expect(await importProviderAvatar('telegram', picture, fetcher)).toMatch(
    /^data:image\/jpeg;base64,/,
  );
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    new URL(picture),
    expect.objectContaining({ redirect: 'error' }),
  );
});
