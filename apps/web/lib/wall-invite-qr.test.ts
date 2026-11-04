import { expect, it } from 'vitest';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { wallInviteQr } from './wall-invite-qr';
it('encodes public invitation URLs that an independent reader decodes exactly', async () => {
  for (const origin of [
    'https://destka.ru',
    'http://127.0.0.1:3000',
    new URL('https://пример.рф').origin,
  ]) {
    const url = origin + '/walls/00000000-0000-4000-8000-000000000001';
    const qr = wallInviteQr(url);
    const { data, info } = await sharp(Buffer.from(qr.svg))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(
      jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data,
    ).toBe(url);
    expect(qr.svg).not.toContain('http://127');
  }
  expect(() => wallInviteQr('https://' + 'a'.repeat(600))).toThrow();
  expect(() => wallInviteQr('javascript:alert(1)')).toThrow();
});
