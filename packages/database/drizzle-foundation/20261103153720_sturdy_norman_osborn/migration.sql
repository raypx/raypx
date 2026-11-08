CREATE TABLE "raypx_foundation"."admin_audit" (
	"id" text PRIMARY KEY,
	"request_id" text NOT NULL,
	"actor_id" text,
	"source" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"before" jsonb,
	"after" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "admin_audit_time_idx" ON "raypx_foundation"."admin_audit" ("started_at","id");--> statement-breakpoint
CREATE INDEX "admin_audit_actor_time_idx" ON "raypx_foundation"."admin_audit" ("actor_id","started_at","id");--> statement-breakpoint
CREATE INDEX "admin_audit_target_time_idx" ON "raypx_foundation"."admin_audit" ("target_id","started_at","id");--> statement-breakpoint
CREATE INDEX "user_created_at_idx" ON "raypx_foundation"."user" ("created_at");