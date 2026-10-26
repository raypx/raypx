ALTER TABLE "raypx_foundation"."cloud_job_run" ADD COLUMN "checked_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DROP INDEX "raypx_foundation"."cloud_job_run_active_idx";--> statement-breakpoint
CREATE INDEX "cloud_job_run_active_idx" ON "raypx_foundation"."cloud_job_run" ("checked_at","id") WHERE "status" in ('dispatching','running','waiting','unknown');