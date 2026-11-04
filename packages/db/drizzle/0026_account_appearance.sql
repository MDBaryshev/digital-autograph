CREATE TABLE "account_appearance" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"title" varchar(100) DEFAULT '' NOT NULL,
	"description" varchar(500) DEFAULT '' NOT NULL,
	"avatar_data_url" text,
	"cover_data_url" text,
	"provider_avatar_data_url" text,
	"avatar_source" varchar(16),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appearance_avatar_source" CHECK (("account_appearance"."avatar_source" IS NULL AND "account_appearance"."avatar_data_url" IS NULL) OR ("account_appearance"."avatar_source" IS NOT NULL AND "account_appearance"."avatar_source" IN ('provider','upload','none') AND ("account_appearance"."avatar_source" <> 'none' OR "account_appearance"."avatar_data_url" IS NULL))),
	CONSTRAINT "appearance_avatar_bounded" CHECK ("account_appearance"."avatar_data_url" IS NULL OR (length("account_appearance"."avatar_data_url") BETWEEN 24 AND 350000 AND "account_appearance"."avatar_data_url" ~ ('^data:image/jpeg' || chr(59) || 'base64,[A-Za-z0-9+/]+={0,2}$'))),
	CONSTRAINT "appearance_cover_bounded" CHECK ("account_appearance"."cover_data_url" IS NULL OR (length("account_appearance"."cover_data_url") BETWEEN 24 AND 350000 AND "account_appearance"."cover_data_url" ~ ('^data:image/jpeg' || chr(59) || 'base64,[A-Za-z0-9+/]+={0,2}$'))),
	CONSTRAINT "appearance_provider_bounded" CHECK ("account_appearance"."provider_avatar_data_url" IS NULL OR (length("account_appearance"."provider_avatar_data_url") BETWEEN 24 AND 350000 AND "account_appearance"."provider_avatar_data_url" ~ ('^data:image/jpeg' || chr(59) || 'base64,[A-Za-z0-9+/]+={0,2}$')))
);
--> statement-breakpoint
ALTER TABLE "account_appearance" ADD CONSTRAINT "account_appearance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;