import { z } from 'zod';

export const productAnalyticsClientEvents = [
  'wall_view',
  'auth_started',
  'signature_started',
  'takeover_clicked',
  'payment_started',
  'share_clicked',
  'notification_opened',
] as const;

export const productAnalyticsServerEvents = [
  'auth_completed',
  'signature_uploaded',
  'signature_processed',
  'signature_confirmed',
  'free_claimed',
  'quote_created',
  'reservation_created',
  'payment_success',
  'payment_failed',
  'takeover_completed',
  'displaced',
  'report_submitted',
  'creator_wall_created',
  'creator_wall_launched',
  'creator_wall_ended',
] as const;

// Export-local identifiers only. These schemas do not authorize collection or
// establish the authenticity of a file labelled "server" by an operator.
const exportKey = z.uuid().transform((value) => value.toLowerCase());
const productAnalyticsEnvelope = z
  .object({
    schemaVersion: z.literal(1),
    eventId: exportKey,
    occurredAt: z.iso
      .datetime()
      .transform((value) => new Date(value).toISOString()),
    wallKey: exportKey,
    journeyKey: exportKey,
  })
  .strict();

export const productAnalyticsClientEventSchema =
  productAnalyticsEnvelope.extend({
    name: z.enum(productAnalyticsClientEvents),
  });
export const productAnalyticsServerEventSchema =
  productAnalyticsEnvelope.extend({
    name: z.enum(productAnalyticsServerEvents),
  });

export type ProductAnalyticsClientEvent = z.infer<
  typeof productAnalyticsClientEventSchema
>;
export type ProductAnalyticsServerEvent = z.infer<
  typeof productAnalyticsServerEventSchema
>;
export type ProductAnalyticsEventName =
  ProductAnalyticsClientEvent['name'] | ProductAnalyticsServerEvent['name'];
export type ProductAnalyticsSource = 'client' | 'server';
