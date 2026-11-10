import { z } from 'zod';
import { moderationRejectionReasons } from '@digital-autograph/domain';

export const profileSubmissionMetadata = {
  operationKey: z.uuid().optional(),
  expectedSubmissionId: z.uuid().nullable().optional(),
};
export const profileRejectionReasons = moderationRejectionReasons.filter(
  (reason) => reason !== 'NOT_AN_AUTOGRAPH',
);
export const profileModerationDecisionBody = z.discriminatedUnion('decision', [
  z.strictObject({ decision: z.literal('approved') }),
  z.strictObject({
    decision: z.literal('rejected'),
    reasonCode: z.enum(profileRejectionReasons),
  }),
]);
