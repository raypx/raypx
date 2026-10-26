CREATE TABLE "raypx_foundation"."cloud_job" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"cron" text NOT NULL,
	"timezone" text NOT NULL,
	"enabled" boolean NOT NULL,
	"action" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."cloud_job_run" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"job_revision" integer NOT NULL,
	"trigger" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"action" jsonb NOT NULL,
	"task_id" text,
	"code" text,
	"sync" jsonb
);
--> statement-breakpoint
CREATE INDEX "cloud_job_owner_idx" ON "raypx_foundation"."cloud_job" ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_job_due_idx" ON "raypx_foundation"."cloud_job" ("next_run_at","id") WHERE "enabled"=true;--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_job_run_schedule_idx" ON "raypx_foundation"."cloud_job_run" ("job_id","scheduled_for") WHERE "trigger"='schedule';--> statement-breakpoint
CREATE INDEX "cloud_job_run_history_idx" ON "raypx_foundation"."cloud_job_run" ("user_id","job_id","started_at","id");--> statement-breakpoint
CREATE INDEX "cloud_job_run_active_idx" ON "raypx_foundation"."cloud_job_run" ("started_at","id") WHERE "status" in ('dispatching','running','waiting','unknown');--> statement-breakpoint
ALTER TABLE "raypx_foundation"."cloud_job" ADD CONSTRAINT "cloud_job_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."cloud_job_run" ADD CONSTRAINT "cloud_job_run_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."cloud_job_run" ADD CONSTRAINT "cloud_job_run_job_id_cloud_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "raypx_foundation"."cloud_job"("id") ON DELETE CASCADE;