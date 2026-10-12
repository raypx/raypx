CREATE TABLE "pi_sessions" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"agent_run_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"prompt" text NOT NULL,
	"context" jsonb NOT NULL,
	"status" "agent_run_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pi_sessions_agent_run_id_idx" ON "pi_sessions" ("agent_run_id");--> statement-breakpoint
CREATE INDEX "pi_sessions_project_id_updated_at_idx" ON "pi_sessions" ("project_id","updated_at");--> statement-breakpoint
ALTER TABLE "pi_sessions" ADD CONSTRAINT "pi_sessions_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pi_sessions" ADD CONSTRAINT "pi_sessions_agent_run_id_agent_runs_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "pi_sessions" ADD CONSTRAINT "pi_sessions_requested_by_users_id_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT;