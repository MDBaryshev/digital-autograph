import { z } from 'zod';
import { adminRecordKinds } from '@digital-autograph/domain';

// An absent ID is an access probe; it never enumerates records.
export const adminLookupQuery = z.strictObject({
  id: z
    .uuid()
    .transform((id) => id.toLowerCase())
    .optional(),
});
export const adminLookupResponse = z.strictObject({
  items: z
    .array(
      z.strictObject({
        kind: z.enum(adminRecordKinds),
        id: z.uuid(),
        state: z.string().min(1).max(64).nullable(),
        createdAt: z.iso.datetime({ offset: true }),
      }),
    )
    .max(adminRecordKinds.length),
});
export type AdminLookupResponse = z.infer<typeof adminLookupResponse>;
