CREATE TYPE "agent_run_status_v2" AS ENUM('queued', 'running', 'waiting_for_approval', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "review_status_v2" AS ENUM('open', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "activities_v2" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs_v2" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"asset_version_id" text,
	"status" "agent_run_status_v2" DEFAULT 'queued'::"agent_run_status_v2" NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_versions_v2" (
	"id" text PRIMARY KEY,
	"asset_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"object_key" text NOT NULL,
	"byte_size" integer NOT NULL,
	"media_type" text NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets_v2" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_v2" (
	"id" text PRIMARY KEY,
	"review_id" text NOT NULL,
	"project_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews_v2" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"asset_version_id" text,
	"created_by_user_id" text NOT NULL,
	"status" "review_status_v2" DEFAULT 'open'::"review_status_v2" NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activities_v2_project_occurred_idx" ON "activities_v2" ("project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "agent_runs_v2_project_status_idx" ON "agent_runs_v2" ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_versions_v2_object_key_idx" ON "asset_versions_v2" ("object_key");--> statement-breakpoint
CREATE INDEX "asset_versions_v2_project_created_idx" ON "asset_versions_v2" ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_v2_project_updated_idx" ON "assets_v2" ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "feedback_v2_review_created_idx" ON "feedback_v2" ("review_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_v2_project_updated_idx" ON "reviews_v2" ("project_id","updated_at");--> statement-breakpoint
ALTER TABLE "activities_v2" ADD CONSTRAINT "activities_v2_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activities_v2" ADD CONSTRAINT "activities_v2_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "agent_runs_v2" ADD CONSTRAINT "agent_runs_v2_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_runs_v2" ADD CONSTRAINT "agent_runs_v2_requested_by_user_id_users_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "agent_runs_v2" ADD CONSTRAINT "agent_runs_v2_asset_version_id_asset_versions_v2_id_fkey" FOREIGN KEY ("asset_version_id") REFERENCES "asset_versions_v2"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "asset_versions_v2" ADD CONSTRAINT "asset_versions_v2_asset_id_assets_v2_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_versions_v2" ADD CONSTRAINT "asset_versions_v2_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_versions_v2" ADD CONSTRAINT "asset_versions_v2_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "assets_v2" ADD CONSTRAINT "assets_v2_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assets_v2" ADD CONSTRAINT "assets_v2_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "feedback_v2" ADD CONSTRAINT "feedback_v2_review_id_reviews_v2_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feedback_v2" ADD CONSTRAINT "feedback_v2_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feedback_v2" ADD CONSTRAINT "feedback_v2_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "reviews_v2" ADD CONSTRAINT "reviews_v2_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reviews_v2" ADD CONSTRAINT "reviews_v2_asset_version_id_asset_versions_v2_id_fkey" FOREIGN KEY ("asset_version_id") REFERENCES "asset_versions_v2"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "reviews_v2" ADD CONSTRAINT "reviews_v2_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;