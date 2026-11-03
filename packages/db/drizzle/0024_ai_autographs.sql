CREATE TABLE "ai_autograph_requests" (
	"user_id" uuid NOT NULL,
	"operation" varchar(80) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"model" varchar(200) NOT NULL,
	"state" varchar(16) DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_autograph_requests_user_id_operation_pk" PRIMARY KEY("user_id","operation")
);
--> statement-breakpoint
ALTER TABLE "ai_autograph_requests" ADD CONSTRAINT "ai_autograph_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_requests_daily" ON "ai_autograph_requests" USING btree ("kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_moderation_once" ON "ai_autograph_requests" USING btree ("operation") WHERE kind = 'moderation';
--> statement-breakpoint
ALTER TABLE ai_autograph_requests ADD CONSTRAINT ai_kind CHECK(kind IN ('generation','moderation'));
ALTER TABLE ai_autograph_requests ADD CONSTRAINT ai_state CHECK(state IN ('pending','completed','failed'));
--> statement-breakpoint
CREATE FUNCTION guard_ai_moderation_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind='moderation' AND OLD.state<>'pending' THEN
    RAISE EXCEPTION 'Completed AI moderation evidence is immutable';
  END IF;
  IF NEW.user_id<>OLD.user_id OR NEW.operation<>OLD.operation OR NEW.kind<>OLD.kind OR NEW.fingerprint<>OLD.fingerprint OR NEW.model<>OLD.model OR NEW.created_at<>OLD.created_at THEN
    RAISE EXCEPTION 'AI request identity is immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER ai_moderation_audit_immutable BEFORE UPDATE ON ai_autograph_requests FOR EACH ROW EXECUTE FUNCTION guard_ai_moderation_audit();
