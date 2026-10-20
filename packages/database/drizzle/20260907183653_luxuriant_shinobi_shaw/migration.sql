CREATE TYPE "agent_run_status" AS ENUM('queued', 'running', 'waiting_for_approval', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "agent_step_status" AS ENUM('queued', 'running', 'waiting_for_approval', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "asset_status" AS ENUM('active', 'deleted');--> statement-breakpoint
CREATE TYPE "sync_conflict_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "agent_leases" (
	"run_id" text PRIMARY KEY,
	"holder_id" text NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'queued'::"agent_run_status" NOT NULL,
	"goal" text NOT NULL,
	"current_step_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" text PRIMARY KEY,
	"run_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"status" "agent_step_status" DEFAULT 'queued'::"agent_step_status" NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" text PRIMARY KEY,
	"asset_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"blob_hash" text NOT NULL,
	"byte_size" integer NOT NULL,
	"content_type" text,
	"parent_version_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"path" text NOT NULL,
	"status" "asset_status" DEFAULT 'active'::"asset_status" NOT NULL,
	"head_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"local_version_id" text,
	"remote_version_id" text,
	"expected_head_version_id" text,
	"actual_head_version_id" text,
	"status" "sync_conflict_status" DEFAULT 'open'::"sync_conflict_status" NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
CREATE INDEX "agent_leases_expires_at_idx" ON "agent_leases" ("expires_at");--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_id_status_idx" ON "agent_runs" ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "agent_runs_requested_by_idx" ON "agent_runs" ("requested_by");--> statement-breakpoint
CREATE INDEX "agent_runs_updated_at_idx" ON "agent_runs" ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_steps_run_id_sequence_idx" ON "agent_steps" ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "agent_steps_run_id_status_idx" ON "agent_steps" ("run_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_versions_asset_id_idempotency_key_idx" ON "asset_versions" ("asset_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "asset_versions_asset_id_created_at_idx" ON "asset_versions" ("asset_id","created_at");--> statement-breakpoint
CREATE INDEX "asset_versions_workspace_id_idx" ON "asset_versions" ("workspace_id");--> statement-breakpoint
CREATE INDEX "asset_versions_parent_version_id_idx" ON "asset_versions" ("parent_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_workspace_id_path_idx" ON "assets" ("workspace_id","path");--> statement-breakpoint
CREATE INDEX "assets_workspace_id_status_idx" ON "assets" ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "assets_head_version_id_idx" ON "assets" ("head_version_id");--> statement-breakpoint
CREATE INDEX "sync_conflicts_workspace_id_status_idx" ON "sync_conflicts" ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "sync_conflicts_asset_id_idx" ON "sync_conflicts" ("asset_id");--> statement-breakpoint
CREATE INDEX "sync_conflicts_detected_at_idx" ON "sync_conflicts" ("detected_at");--> statement-breakpoint
ALTER TABLE "agent_leases" ADD CONSTRAINT "agent_leases_run_id_agent_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_requested_by_users_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_run_id_agent_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_assets_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_asset_id_assets_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_resolved_by_users_id_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL;