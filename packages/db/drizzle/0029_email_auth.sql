CREATE TABLE "auth_rate_limits" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"used" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"purpose" text NOT NULL,
	"user_id" uuid,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "email_auth_challenges_purpose" CHECK (("email_auth_challenges"."purpose" = 'register' AND "email_auth_challenges"."user_id" IS NULL) OR ("email_auth_challenges"."purpose" = 'reset' AND "email_auth_challenges"."user_id" IS NOT NULL)),
	CONSTRAINT "email_auth_challenges_expiry" CHECK ("email_auth_challenges"."expires_at" > "email_auth_challenges"."created_at")
);
--> statement-breakpoint
CREATE TABLE "email_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_credentials_normalized" CHECK ("email_credentials"."email" = lower(btrim("email_credentials"."email")) AND length("email_credentials"."email") BETWEEN 3 AND 254)
);
--> statement-breakpoint
ALTER TABLE "email_auth_challenges" ADD CONSTRAINT "email_auth_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_credentials" ADD CONSTRAINT "email_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_rate_limits_expiry_idx" ON "auth_rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_auth_challenges_token_uidx" ON "email_auth_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_auth_challenges_email_idx" ON "email_auth_challenges" USING btree ("email","purpose","created_at");--> statement-breakpoint
CREATE INDEX "email_auth_challenges_expiry_idx" ON "email_auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "email_credentials_email_uidx" ON "email_credentials" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX "social_identities_telegram_user_uidx" ON "social_identities" USING btree ("user_id") WHERE "provider" = 'telegram';
