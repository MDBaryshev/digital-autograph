export const adminRecordKinds = [
  'user',
  'creator',
  'wall',
  'autograph',
  'order',
  'payment',
] as const;
export type AdminRecordKind = (typeof adminRecordKinds)[number];
