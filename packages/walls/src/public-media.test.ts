import { expect, it, vi } from 'vitest';
import {
  PublicPlacementMediaService,
  type PublicPlacementMediaResolution,
} from './public-media';

const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
const available = {
  kind: 'available',
  storageKey: 'private/cleaned.png',
  verifiedSizeBytes: bytes.length,
} as const;

it('returns a verified derivative only while the same public resolution still applies', async () => {
  const resolveActive = vi.fn().mockResolvedValue(available);
  const getPrivateObject = vi.fn().mockResolvedValue(bytes);
  const service = new PublicPlacementMediaService(
    { resolveActive },
    { getPrivateObject },
  );
  expect(await service.getActivePng('placement')).toBe(bytes);
  expect(resolveActive).toHaveBeenCalledTimes(2);
  expect(getPrivateObject).toHaveBeenCalledTimes(1);
});

it.each<PublicPlacementMediaResolution>([
  { kind: 'not_found' },
  { kind: 'inconsistent' },
  { ...available, storageKey: 'private/another-derivative.png' },
  { ...available, verifiedSizeBytes: bytes.length + 1 },
])(
  'withholds already-read bytes if the current resolution changes: %j',
  async (after) => {
    const resolveActive = vi
      .fn()
      .mockResolvedValueOnce(available)
      .mockResolvedValueOnce(after);
    const getPrivateObject = vi.fn().mockResolvedValue(bytes);
    const service = new PublicPlacementMediaService(
      { resolveActive },
      { getPrivateObject },
    );
    await expect(service.getActivePng('placement')).rejects.toMatchObject({
      reason: after.kind === 'not_found' ? 'not_found' : 'inconsistent',
    });
    expect(getPrivateObject).toHaveBeenCalledTimes(1);
  },
);
