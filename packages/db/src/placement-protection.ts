// Fixed SQL fragment for queries whose Placement alias is p. Checkout evidence
// is immutable: historical paid placements retain their original duration.
export const paidProtectionSecondsSql = `(SELECT cc.guaranteed_visibility_seconds
  FROM payment_orders po JOIN checkout_confirmations cc ON cc.order_id = po.id
  WHERE po.placement_id = p.id)`;
