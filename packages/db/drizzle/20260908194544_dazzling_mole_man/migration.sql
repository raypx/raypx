CREATE TYPE "activity_type" AS ENUM('project.created', 'project.updated', 'project.stage.changed', 'project.archived', 'project.restored', 'asset.added', 'asset.version.committed', 'review.created', 'review.status.changed', 'feedback.created', 'feedback.resolved', 'pi.session.started', 'pi.session.completed');--> statement-breakpoint
CREATE TYPE "feedback_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "review_status" AS ENUM('draft', 'open', 'changes_requested', 'approved', 'closed');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY,
	"type" "activity_type" NOT NULL,
	"account_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"actor_id" text NOT NULL,
	"target_id" text,
	"summary" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY,
	"review_id" text NOT NULL,
	"project_id" text NOT NULL,
	"target_version_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"status" "feedback_status" DEFAULT 'open'::"feedback_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"target_version_id" text,
	"status" "review_status" DEFAULT 'draft'::"review_status" NOT NULL,
	"title" text NOT NULL,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text
);
--> statement-breakpoint
CREATE INDEX "activities_account_id_occurred_at_idx" ON "activities" ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activities_project_id_occurred_at_idx" ON "activities" ("project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activities_workspace_id_occurred_at_idx" ON "activities" ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "feedback_review_id_created_at_idx" ON "feedback" ("review_id","created_at");--> statement-breakpoint
CREATE INDEX "feedback_project_id_idx" ON "feedback" ("project_id");--> statement-breakpoint
CREATE INDEX "feedback_author_id_idx" ON "feedback" ("author_id");--> statement-breakpoint
CREATE INDEX "reviews_project_id_updated_at_idx" ON "reviews" ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "reviews_project_id_status_idx" ON "reviews" ("project_id","status");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_review_id_reviews_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_author_id_users_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_resolved_by_users_id_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_requested_by_users_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_resolved_by_users_id_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL;