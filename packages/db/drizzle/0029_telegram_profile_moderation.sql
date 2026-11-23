CREATE TABLE "telegram_profile_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"status" varchar(16) DEFAULT 'queued' NOT NULL,
	"display_name" varchar(200),
	"username" varchar(64),
	"avatar_data_url" text,
	"started_at" timestamp with time zone,
	"lease_id" uuid,
	"lease_until" timestamp with time zone,
	"model" varchar(200),
	"assessment" varchar(16),
	"reason_code" "autograph_moderation_reason",
	"submission_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_profile_checks_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "telegram_profile_check_fingerprint" CHECK ("telegram_profile_checks"."fingerprint" ~ '^[a-f0-9]{64}$' AND "telegram_profile_checks"."version" > 0),
	CONSTRAINT "telegram_profile_check_avatar" CHECK ("telegram_profile_checks"."avatar_data_url" IS NULL OR (length("telegram_profile_checks"."avatar_data_url") BETWEEN 24 AND 350000 AND "telegram_profile_checks"."avatar_data_url" ~ ('^data:image/jpeg' || chr(59) || 'base64,[A-Za-z0-9+/]+={0,2}$'))),
	CONSTRAINT "telegram_profile_check_state" CHECK (
      ("telegram_profile_checks"."status" IN ('queued','running') AND ("telegram_profile_checks"."display_name" IS NOT NULL OR "telegram_profile_checks"."username" IS NOT NULL OR "telegram_profile_checks"."avatar_data_url" IS NOT NULL)
        AND "telegram_profile_checks"."assessment" IS NULL AND "telegram_profile_checks"."submission_id" IS NULL)
      OR ("telegram_profile_checks"."status" IN ('cleared','review','superseded') AND "telegram_profile_checks"."display_name" IS NULL AND "telegram_profile_checks"."username" IS NULL AND "telegram_profile_checks"."avatar_data_url" IS NULL
        AND (("telegram_profile_checks"."status" = 'review' AND "telegram_profile_checks"."submission_id" IS NOT NULL AND "telegram_profile_checks"."assessment" IN ('flagged','uncertain','unavailable','quota'))
          OR ("telegram_profile_checks"."status" = 'cleared' AND "telegram_profile_checks"."submission_id" IS NULL AND "telegram_profile_checks"."assessment" = 'clear')
          OR ("telegram_profile_checks"."status" = 'superseded' AND "telegram_profile_checks"."submission_id" IS NULL AND "telegram_profile_checks"."assessment" IS NULL)))),
	CONSTRAINT "telegram_profile_check_lease" CHECK (
      ("telegram_profile_checks"."status" = 'running' AND "telegram_profile_checks"."lease_id" IS NOT NULL AND "telegram_profile_checks"."lease_until" IS NOT NULL AND "telegram_profile_checks"."started_at" IS NOT NULL)
      OR ("telegram_profile_checks"."status" <> 'running' AND "telegram_profile_checks"."lease_id" IS NULL AND "telegram_profile_checks"."lease_until" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "profile_submissions" DROP CONSTRAINT "profile_submission_fields";--> statement-breakpoint
ALTER TABLE "telegram_profile_checks" ADD CONSTRAINT "telegram_profile_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_profile_checks" ADD CONSTRAINT "telegram_profile_checks_submission_id_profile_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."profile_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_profile_checks_version_uidx" ON "telegram_profile_checks" USING btree ("user_id","version");--> statement-breakpoint
CREATE INDEX "telegram_profile_checks_queue_idx" ON "telegram_profile_checks" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "telegram_profile_checks_started_idx" ON "telegram_profile_checks" USING btree ("started_at") WHERE "telegram_profile_checks"."started_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_submissions" ADD CONSTRAINT "profile_submission_fields" CHECK ((
      "profile_submissions"."kind" = 'profile' AND "profile_submissions"."slug" IS NOT NULL
      AND "profile_submissions"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(btrim("profile_submissions"."display_name")) > 0
      AND "profile_submissions"."display_name" IS NOT NULL AND "profile_submissions"."title" IS NULL AND "profile_submissions"."description" IS NULL
      AND "profile_submissions"."avatar_source" IS NULL AND "profile_submissions"."avatar_data_url" IS NULL AND "profile_submissions"."cover_data_url" IS NULL
    ) OR (
      "profile_submissions"."kind" = 'appearance' AND "profile_submissions"."creator_id" IS NULL AND "profile_submissions"."slug" IS NULL AND "profile_submissions"."display_name" IS NULL
      AND "profile_submissions"."title" IS NOT NULL AND "profile_submissions"."description" IS NOT NULL AND "profile_submissions"."avatar_source" IS NOT NULL
      AND "profile_submissions"."avatar_source" IN ('provider','upload','none') AND ("profile_submissions"."avatar_source" <> 'none' OR "profile_submissions"."avatar_data_url" IS NULL)
    ) OR (
      "profile_submissions"."kind" = 'telegram' AND "profile_submissions"."creator_id" IS NULL AND "profile_submissions"."title" IS NULL
      AND "profile_submissions"."description" IS NULL AND "profile_submissions"."avatar_source" IS NULL AND "profile_submissions"."cover_data_url" IS NULL
      AND ("profile_submissions"."slug" IS NULL OR "profile_submissions"."slug" ~ '^[A-Za-z0-9_]{1,64}$')
      AND ("profile_submissions"."display_name" IS NOT NULL OR "profile_submissions"."slug" IS NOT NULL OR "profile_submissions"."avatar_data_url" IS NOT NULL)
    ));