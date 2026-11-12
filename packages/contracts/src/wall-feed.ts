import { z } from 'zod';

export const wallFeedModes = ['for-you', 'following'] as const;
const mode = z.enum(wallFeedModes);
export type WallFeedMode = z.infer<typeof mode>;

export const wallFeedQuery = z.strictObject({
  mode: mode.default('for-you'),
  limit: z.coerce.number().int().min(1).max(30).default(20),
  cursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,256}$/)
    .optional(),
});

export const wallFeedReasons = [
  'following',
  'signed',
  'related',
  'discovery',
] as const;

export const wallFeedResponse = z.strictObject({
  items: z.array(
    z.strictObject({
      id: z.uuid(),
      creator: z.strictObject({ slug: z.string(), displayName: z.string() }),
      title: z.string(),
      status: z.enum(['scheduled', 'live', 'paused', 'ended']),
      slotCount: z.number().int().min(1),
      occupiedCount: z.number().int().nonnegative(),
      activityAt: z.iso.datetime(),
      activityKind: z.enum(['placement', 'wall']),
      reason: z.enum(wallFeedReasons),
    }),
  ),
  nextCursor: z.string().nullable(),
});

export const creatorFollowResponse = z.strictObject({
  state: z.enum(['guest', 'self', 'following', 'not-following']),
});

export const wallDiscoveryResponse = z.strictObject({
  discoverable: z.boolean(),
});

export type WallFeed = z.infer<typeof wallFeedResponse>;
