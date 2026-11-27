import { expect, it } from 'vitest';
import { buildShareCardSvg } from './share-card';

it('excludes an unreviewed legacy alias from the rasterizer input even from an older repository', () => {
  const share = {
    id: 'id',
    wallId: 'wall',
    slotId: 'slot',
    slotNumber: 1,
    creator: 'Synthetic creator',
    event: 'slot_claimed' as const,
  };
  expect(
    buildShareCardSvg({ ...share, publicAlias: 'Synthetic_channel' }),
  ).toBe(buildShareCardSvg({ ...share, publicAlias: null }));
});
