CREATE TYPE "audit_target_type" AS ENUM('user', 'system_setting');--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'system.settings.updated';--> statement-breakpoint
ALTER TYPE "audit_action" ADD VALUE 'system.mail.test.sent';--> statement-breakpoint
CREATE TABLE "system_secrets" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_target_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "target_type" "audit_target_type" DEFAULT 'user'::"audit_target_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "target_user_id" text GENERATED ALWAYS AS (case when "target_type" = 'user' then "target_id" else null end) STORED;--> statement-breakpoint
CREATE INDEX "audit_events_target_user_id_idx" ON "audit_events" ("target_user_id");--> statement-breakpoint
CREATE INDEX "system_secrets_updated_by_idx" ON "system_secrets" ("updated_by");--> statement-breakpoint
CREATE INDEX "system_settings_updated_by_idx" ON "system_settings" ("updated_by");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_user_id_users_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "system_secrets" ADD CONSTRAINT "system_secrets_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;