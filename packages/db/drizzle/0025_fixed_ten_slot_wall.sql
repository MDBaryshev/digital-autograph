-- Do not choose a surviving Wall or delete Slots/history during this migration.
LOCK TABLE creators, walls, slots IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM walls w
    WHERE w.slot_count <> 10
       OR (SELECT count(*) FROM slots s WHERE s.wall_id = w.id) <> 10
       OR EXISTS (SELECT 1 FROM slots s WHERE s.wall_id = w.id AND s.position NOT BETWEEN 0 AND 9)
  ) OR EXISTS (
    SELECT c.owner_user_id FROM walls w JOIN creators c ON c.id = w.creator_id
    WHERE c.owner_user_id IS NOT NULL GROUP BY c.owner_user_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'WALL_POLICY_MIGRATION_REQUIRES_REVIEW: existing Walls must have ten positions and at most one Wall per account';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "slots" DROP CONSTRAINT "slots_position_nonnegative";--> statement-breakpoint
ALTER TABLE "walls" DROP CONSTRAINT "walls_slot_count_nonnegative";--> statement-breakpoint
ALTER TABLE "walls" ALTER COLUMN "slot_count" SET DEFAULT 10;--> statement-breakpoint
ALTER TABLE "walls" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
UPDATE walls w SET owner_user_id = c.owner_user_id FROM creators c WHERE c.id = w.creator_id;
--> statement-breakpoint
ALTER TABLE "walls" ADD CONSTRAINT "walls_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "walls_owner_user_uidx" ON "walls" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_position_in_wall" CHECK ("slots"."position" BETWEEN 0 AND 9);--> statement-breakpoint
ALTER TABLE "walls" ADD CONSTRAINT "walls_slot_count_ten" CHECK ("walls"."slot_count" = 10);
--> statement-breakpoint
CREATE FUNCTION guard_wall_account_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT owner_user_id INTO NEW.owner_user_id FROM public.creators WHERE id = NEW.creator_id FOR SHARE;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER walls_derive_account_owner BEFORE INSERT OR UPDATE ON walls
FOR EACH ROW EXECUTE FUNCTION guard_wall_account_owner();
--> statement-breakpoint
CREATE FUNCTION sync_creator_wall_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.walls SET owner_user_id = NEW.owner_user_id WHERE creator_id = NEW.id;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER creators_sync_wall_owner AFTER UPDATE OF owner_user_id ON creators
FOR EACH ROW WHEN (OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id)
EXECUTE FUNCTION sync_creator_wall_owner();
--> statement-breakpoint
CREATE FUNCTION create_ten_wall_slots() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.slots(wall_id,position) SELECT NEW.id, n FROM generate_series(0,9) AS n;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER walls_create_ten_slots AFTER INSERT ON walls
FOR EACH ROW EXECUTE FUNCTION create_ten_wall_slots();
--> statement-breakpoint
CREATE FUNCTION guard_fixed_wall_slots() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'WALL_STRUCTURE_LOCKED' USING ERRCODE = '23514';
  END IF;
  IF NEW.wall_id IS DISTINCT FROM OLD.wall_id OR NEW.position IS DISTINCT FROM OLD.position THEN
    RAISE EXCEPTION 'WALL_STRUCTURE_LOCKED' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER slots_fixed_structure BEFORE DELETE OR UPDATE ON slots
FOR EACH ROW EXECUTE FUNCTION guard_fixed_wall_slots();
