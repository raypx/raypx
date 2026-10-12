CREATE TYPE "project_stage" AS ENUM('draft', 'in_progress', 'review', 'delivered');--> statement-breakpoint
CREATE TYPE "project_task_status" AS ENUM('todo', 'in_progress', 'blocked', 'done');--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"status" "project_task_status" DEFAULT 'todo'::"project_task_status" NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"stage" "project_stage" DEFAULT 'draft'::"project_stage" NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"previous_stage" "project_stage",
	"deadline" timestamp with time zone,
	"cover" text,
	"thumbnail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "project_tasks_project_id_updated_at_idx" ON "project_tasks" ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "project_tasks_project_id_status_idx" ON "project_tasks" ("project_id","status");--> statement-breakpoint
CREATE INDEX "project_tasks_created_by_idx" ON "project_tasks" ("created_by");--> statement-breakpoint
CREATE INDEX "projects_workspace_id_updated_at_idx" ON "projects" ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "projects_owner_id_idx" ON "projects" ("owner_id");--> statement-breakpoint
CREATE INDEX "projects_stage_archived_idx" ON "projects" ("stage","archived");--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;