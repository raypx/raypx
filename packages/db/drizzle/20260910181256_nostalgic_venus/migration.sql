CREATE TYPE "scheduled_task_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"instruction" text NOT NULL,
	"schedule" text NOT NULL,
	"status" "scheduled_task_status" DEFAULT 'active'::"scheduled_task_status" NOT NULL,
	"execution_status" text DEFAULT 'unavailable' NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "scheduled_tasks_workspace_updated_idx" ON "scheduled_tasks" ("workspace_id","updated_at");--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_created_by_users_id_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT;