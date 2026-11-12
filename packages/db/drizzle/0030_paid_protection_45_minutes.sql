-- EGO-185: new paid Orders pin 45 minutes, independently of old Wall pricing.
-- Existing evidence is append-only and is not rewritten. Existing Orders recover
-- under their own stored terms. Replace all API/worker versions before admitting
-- new paid Orders; older binaries must not serve new admission after this change.
CREATE OR REPLACE FUNCTION guard_checkout_confirmation_insert() RETURNS trigger AS $$
DECLARE o payment_orders%ROWTYPE; r takeover_reservations%ROWTYPE;
BEGIN
 SELECT * INTO o FROM payment_orders WHERE id=NEW.order_id FOR SHARE;
 SELECT * INTO r FROM takeover_reservations WHERE id=o.reservation_id;
 IF o.id IS NULL OR
 (NEW.user_id,NEW.reservation_id,NEW.autograph_id,NEW.amount_minor,NEW.currency,NEW.target_placement_id,NEW.pricing_config_id,NEW.offer_version,NEW.offer_hash,NEW.content_rules_version,NEW.content_rules_hash,NEW.refund_policy_version,NEW.refund_policy_hash)
 IS DISTINCT FROM
 (o.user_id,o.reservation_id,o.autograph_id,o.amount_minor,o.currency,o.target_placement_id,o.pricing_config_id,o.offer_version,o.offer_hash,o.content_rules_version,o.content_rules_hash,o.refund_policy_version,o.refund_policy_hash)
 OR NEW.guaranteed_visibility_seconds IS DISTINCT FROM 2700 OR NEW.reservation_expires_at IS DISTINCT FROM r.expires_at THEN
  RAISE EXCEPTION 'checkout evidence binding mismatch' USING ERRCODE='check_violation';
 END IF;
 IF r.status<>'active' OR r.expires_at<=clock_timestamp() OR o.status<>'created' THEN
  RAISE EXCEPTION 'checkout requires a current admission' USING ERRCODE='check_violation';
 END IF;
 NEW.confirmed_at:=clock_timestamp();
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
