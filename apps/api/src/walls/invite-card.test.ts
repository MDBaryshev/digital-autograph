import { expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { renderWallInviteCard } from './invite-card';
import type { PublicWall } from '@digital-autograph/walls';
it('renders a fixed PNG from bounded public text without fetching media or external URLs', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch');
  try {
    const wall: PublicWall = {
      id: 'wall',
      status: 'live',
      startAt: null,
      endAt: null,
      slotCount: 10,
      creator: {
        id: 'creator',
        slug: 'creator',
        displayName: String.fromCharCode(65534, 65535) + 'W'.repeat(200),
      },
      slots: [],
      appearance: {
        title:
          String.fromCharCode(65534, 65535) +
          '<image href="https://private.example"/>'.repeat(4),
        description: 'private candidate',
        avatarDataUrl: null,
        coverDataUrl: null,
      },
    };
    for (const locale of ['ru', 'en'] as const) {
      const png = await renderWallInviteCard(wall, locale);
      const meta = await sharp(png).metadata();
      expect([meta.width, meta.height, meta.format]).toEqual([
        1200,
        630,
        'png',
      ]);
      expect(meta.exif).toBeUndefined();
    }
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    fetcher.mockRestore();
  }
});
