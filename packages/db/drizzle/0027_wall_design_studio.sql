CREATE TABLE "wall_design_templates" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"author_user_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"design" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "wall_design_template_bounded" CHECK (jsonb_typeof("wall_design_templates"."design") = 'object' AND octet_length("wall_design_templates"."design"::text) < 710000)
);
--> statement-breakpoint
CREATE TABLE "wall_designs" (
	"wall_id" uuid PRIMARY KEY NOT NULL,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"design" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wall_design_bounded" CHECK (jsonb_typeof("wall_designs"."design") = 'object' AND octet_length("wall_designs"."design"::text) < 710000)
);
--> statement-breakpoint
ALTER TABLE "wall_design_templates" ADD CONSTRAINT "wall_design_templates_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wall_design_templates" ADD CONSTRAINT "wall_design_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wall_designs" ADD CONSTRAINT "wall_designs_wall_id_walls_id_fk" FOREIGN KEY ("wall_id") REFERENCES "public"."walls"("id") ON DELETE cascade ON UPDATE no action;