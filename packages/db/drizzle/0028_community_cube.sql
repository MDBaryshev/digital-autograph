CREATE TABLE "community_cube_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"autograph_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"generation" integer NOT NULL,
	"cell" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "community_cube_placement_cell_range" CHECK ("community_cube_placements"."cell" BETWEEN 1 AND CASE "community_cube_placements"."generation" WHEN 1 THEN 24 WHEN 2 THEN 144 WHEN 3 THEN 864 WHEN 4 THEN 5184 ELSE 0 END)
);
--> statement-breakpoint
CREATE TABLE "community_cube_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"generation" integer NOT NULL,
	CONSTRAINT "community_cube_singleton" CHECK ("community_cube_state"."id" = 1),
	CONSTRAINT "community_cube_generation_range" CHECK ("community_cube_state"."generation" BETWEEN 1 AND 4)
);
--> statement-breakpoint
ALTER TABLE "community_cube_placements" ADD CONSTRAINT "community_cube_placements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_cube_placements" ADD CONSTRAINT "community_cube_placements_autograph_id_autographs_id_fk" FOREIGN KEY ("autograph_id") REFERENCES "public"."autographs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_cube_placement_request_uidx" ON "community_cube_placements" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "community_cube_active_user_uidx" ON "community_cube_placements" USING btree ("user_id") WHERE "community_cube_placements"."withdrawn_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "community_cube_active_cell_uidx" ON "community_cube_placements" USING btree ("cell") WHERE "community_cube_placements"."withdrawn_at" IS NULL;--> statement-breakpoint
CREATE INDEX "community_cube_placement_autograph_idx" ON "community_cube_placements" USING btree ("autograph_id");--> statement-breakpoint
INSERT INTO "community_cube_state" ("id", "generation") VALUES (1, 1);
