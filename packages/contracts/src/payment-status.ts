import { z } from 'zod';

export const paymentOrderReferenceSchema = z
  .uuid()
  .transform((id) => id.toLowerCase());

// Minimum owner-status projection. Other backend fields, including provider
// URLs, are deliberately not retained by the return-page consumer.
export const paymentOrderStatusSchema = z.object({
  id: paymentOrderReferenceSchema,
  status: z.enum([
    'created',
    'provider_pending',
    'unknown',
    'succeeded',
    'canceled',
    'paid_but_not_fulfilled',
    'fulfilled',
  ]),
});
export type PaymentOrderStatus = z.infer<typeof paymentOrderStatusSchema>;
