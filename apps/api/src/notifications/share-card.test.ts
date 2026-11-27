import { expect, it } from 'vitest';
import { renderShareCard } from './share-card';

it('does not render an unreviewed legacy alias even if supplied by an older repository', async () => {
  const share = {
    id: 'id',
    wallId: 'wall',
    slotId: 'slot',
    slotNumber: 1,
    creator: 'Synthetic creator',
    event: 'slot_claimed' as const,
  };
  expect(
    (
      await renderShareCard({ ...share, publicAlias: 'Synthetic_channel' })
    ).equals(await renderShareCard({ ...share, publicAlias: null })),
  ).toBe(true);
});
