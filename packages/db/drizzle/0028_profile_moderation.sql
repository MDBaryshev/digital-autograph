CREATE TABLE "profile_moderation_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"moderator_user_id" uuid NOT NULL,
	"decision" "autograph_moderation_decision" NOT NULL,
	"reason_code" "autograph_moderation_reason",
	"policy_version" varchar(64) NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_moderation_decisions_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "profile_moderation_reason" CHECK (("profile_moderation_decisions"."decision" = 'approved' AND "profile_moderation_decisions"."reason_code" IS NULL) OR ("profile_moderation_decisions"."decision" = 'rejected' AND "profile_moderation_decisions"."reason_code" IS NOT NULL AND "profile_moderation_decisions"."reason_code" <> 'NOT_AN_AUTOGRAPH'))
);
--> statement-breakpoint
CREATE TABLE "profile_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"version" integer NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"operation_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"creator_id" uuid,
	"slug" varchar(128),
	"display_name" varchar(200),
	"title" varchar(100),
	"description" varchar(500),
	"avatar_source" varchar(16),
	"avatar_data_url" text,
	"cover_data_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_submission_version" CHECK ("profile_submissions"."version" > 0),
	CONSTRAINT "profile_submission_state" CHECK ("profile_submissions"."status" IN ('pending','approved','rejected','superseded')),
	CONSTRAINT "profile_submission_hash" CHECK ("profile_submissions"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "profile_submission_fields" CHECK ((
      "profile_submissions"."kind" = 'profile' AND "profile_submissions"."slug" IS NOT NULL
      AND "profile_submissions"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(btrim("profile_submissions"."display_name")) > 0
      AND "profile_submissions"."display_name" IS NOT NULL AND "profile_submissions"."title" IS NULL AND "profile_submissions"."description" IS NULL
      AND "profile_submissions"."avatar_source" IS NULL AND "profile_submissions"."avatar_data_url" IS NULL AND "profile_submissions"."cover_data_url" IS NULL
    ) OR (
      "profile_submissions"."kind" = 'appearance' AND "profile_submissions"."creator_id" IS NULL AND "profile_submissions"."slug" IS NULL AND "profile_submissions"."display_name" IS NULL
      AND "profile_submissions"."title" IS NOT NULL AND "profile_submissions"."description" IS NOT NULL AND "profile_submissions"."avatar_source" IS NOT NULL
      AND "profile_submissions"."avatar_source" IN ('provider','upload','none') AND ("profile_submissions"."avatar_source" <> 'none' OR "profile_submissions"."avatar_data_url" IS NULL)
    )),
	CONSTRAINT "profile_submission_avatar_bounded" CHECK ("profile_submissions"."avatar_data_url" IS NULL OR (length("profile_submissions"."avatar_data_url") BETWEEN 24 AND 350000 AND "profile_submissions"."avatar_data_url" ~ ('^data:image/jpeg' || chr(59) || 'base64,[A-Za-z0-9+/]+={0,2}$'))),
	CONSTRAINT "profile_submission_cover_bounded" CHECK ("profile_submissions"."cover_data_url" IS NULL OR (length("profile_submissions"."cover_data_url") BETWEEN 24 AND 350000 AND "profile_submissions"."cover_data_url" ~ ('^data:image/jpeg' || chr(59) || 'base64,[A-Za-z0-9+/]+={0,2}$')))
);
--> statement-breakpoint
ALTER TABLE "profile_moderation_decisions" ADD CONSTRAINT "profile_moderation_decisions_submission_id_profile_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."profile_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_moderation_decisions" ADD CONSTRAINT "profile_moderation_decisions_moderator_user_id_users_id_fk" FOREIGN KEY ("moderator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_submissions" ADD CONSTRAINT "profile_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_submissions" ADD CONSTRAINT "profile_submissions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_submissions_operation_uidx" ON "profile_submissions" USING btree ("user_id","operation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_submissions_version_uidx" ON "profile_submissions" USING btree ("user_id","kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_submissions_pending_uidx" ON "profile_submissions" USING btree ("user_id","kind") WHERE "profile_submissions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "profile_submissions_queue_idx" ON "profile_submissions" USING btree ("status","created_at","id");
--> statement-breakpoint
CREATE FUNCTION guard_profile_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'profile_moderation_decisions' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Profile submission evidence is immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'New profile submissions must be pending';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'pending'
     OR NEW.status NOT IN ('approved','rejected','superseded')
     OR (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'Invalid profile submission transition';
  END IF;
  IF NEW.status IN ('approved','rejected') AND NOT EXISTS (
    SELECT 1 FROM profile_moderation_decisions d
    WHERE d.submission_id=NEW.id AND d.decision::text=NEW.status
  ) THEN
    RAISE EXCEPTION 'Profile decision evidence required';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER profile_submissions_immutable BEFORE INSERT OR UPDATE OR DELETE ON profile_submissions
FOR EACH ROW EXECUTE FUNCTION guard_profile_submission();
--> statement-breakpoint
CREATE TRIGGER profile_decisions_append_only BEFORE UPDATE OR DELETE ON profile_moderation_decisions
FOR EACH ROW EXECUTE FUNCTION guard_profile_submission();
