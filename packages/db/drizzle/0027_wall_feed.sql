CREATE TABLE "creator_follows" (
	"follower_user_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_follows_follower_user_id_creator_id_pk" PRIMARY KEY("follower_user_id","creator_id")
);
--> statement-breakpoint
ALTER TABLE "account_appearance" ADD COLUMN "public_updated_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "walls" ADD COLUMN "discoverable" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

ALTER TABLE "creator_follows" ADD CONSTRAINT "creator_follows_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "creator_follows" ADD CONSTRAINT "creator_follows_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "creator_follows_creator_idx" ON "creator_follows" USING btree ("creator_id");
--> statement-breakpoint

CREATE INDEX "walls_discoverable_recent_idx" ON "walls" USING btree ("updated_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "walls"."discoverable" AND "walls"."status" IN ('scheduled', 'live', 'paused', 'ended');
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'da_api') THEN
    GRANT SELECT, INSERT, DELETE ON creator_follows TO da_api;
  END IF;
END $$;
