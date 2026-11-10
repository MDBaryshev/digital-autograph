import { z } from 'zod';
import { creatorSlugParams } from './wall';
import { profileSubmissionMetadata } from './profile-moderation';
// Preserve the existing public creator URL and database name ranges.
export const accountProfileBody = z.strictObject({
  ...profileSubmissionMetadata,
  displayName: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .refine((value) => Array.from(value).length <= 200)
    .refine(
      (value) => !value.includes('\u0000') && !/[\uD800-\uDFFF]/u.test(value),
    ),
  slug: creatorSlugParams.shape.slug.min(1),
});
