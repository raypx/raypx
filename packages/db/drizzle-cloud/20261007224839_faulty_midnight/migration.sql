CREATE TABLE "cloud_execution_grants" (
	"id" text PRIMARY KEY,
	"scope_type" text NOT NULL,
	"owner_user_id" text,
	"project_id" text,
	"actor_id" text,
	"parent_id" text,
	"secondary_parent_id" text,
	"idempotency_key" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_execution_grants_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_messages" (
	"id" text PRIMARY KEY,
	"scope_type" text NOT NULL,
	"owner_user_id" text,
	"project_id" text,
	"actor_id" text,
	"parent_id" text,
	"secondary_parent_id" text,
	"idempotency_key" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_messages_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_spending_grants" (
	"id" text PRIMARY KEY,
	"scope_type" text NOT NULL,
	"owner_user_id" text,
	"project_id" text,
	"actor_id" text,
	"parent_id" text,
	"secondary_parent_id" text,
	"idempotency_key" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_spending_grants_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_task_rounds" (
	"id" text PRIMARY KEY,
	"scope_type" text NOT NULL,
	"owner_user_id" text,
	"project_id" text,
	"actor_id" text,
	"parent_id" text,
	"secondary_parent_id" text,
	"idempotency_key" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"task_id" text NOT NULL,
	"goal_version" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cloud_revisions" DROP CONSTRAINT "cloud_revisions_scope_check";--> statement-breakpoint
DROP INDEX "cloud_revisions_scope_created_idx";--> statement-breakpoint
DROP INDEX "cloud_revisions_secondary_parent_idx";--> statement-breakpoint
DROP INDEX "cloud_revisions_actor_idx";--> statement-breakpoint
DROP INDEX "cloud_revisions_actor_intent_idx";--> statement-breakpoint
ALTER TABLE "cloud_revisions" ADD COLUMN "round_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_revisions" ADD COLUMN "goal_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_runs" ADD COLUMN "round_id" text;--> statement-breakpoint
ALTER TABLE "cloud_runs" ADD COLUMN "owner_account_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_runs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_runs" ADD COLUMN "cancel_requested" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_tasks" ADD COLUMN "current_round_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_tasks" ADD COLUMN "goal_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_usage_calls" ADD COLUMN "owner_account_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_usage_calls" ADD COLUMN "round_id" text;--> statement-breakpoint
CREATE INDEX "cloud_execution_grants_scope_created_idx" ON "cloud_execution_grants" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_execution_grants_parent_idx" ON "cloud_execution_grants" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_execution_grants_secondary_parent_idx" ON "cloud_execution_grants" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_execution_grants_actor_idx" ON "cloud_execution_grants" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_execution_grants_actor_intent_idx" ON "cloud_execution_grants" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_messages_scope_created_idx" ON "cloud_messages" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_messages_parent_idx" ON "cloud_messages" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_messages_secondary_parent_idx" ON "cloud_messages" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_messages_actor_idx" ON "cloud_messages" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_messages_actor_intent_idx" ON "cloud_messages" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_revisions_round_idx" ON "cloud_revisions" ("round_id");--> statement-breakpoint
CREATE INDEX "cloud_runs_owner_account_idx" ON "cloud_runs" ("owner_account_id","status");--> statement-breakpoint
CREATE INDEX "cloud_runs_round_idx" ON "cloud_runs" ("round_id");--> statement-breakpoint
CREATE INDEX "cloud_runs_expired_lease_idx" ON "cloud_runs" ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "cloud_spending_grants_scope_created_idx" ON "cloud_spending_grants" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_spending_grants_parent_idx" ON "cloud_spending_grants" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_spending_grants_secondary_parent_idx" ON "cloud_spending_grants" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_spending_grants_actor_idx" ON "cloud_spending_grants" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_spending_grants_actor_intent_idx" ON "cloud_spending_grants" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_task_rounds_task_version_idx" ON "cloud_task_rounds" ("task_id","goal_version");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_task_rounds_actor_intent_idx" ON "cloud_task_rounds" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_task_rounds_parent_idx" ON "cloud_task_rounds" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_usage_calls_account_state_idx" ON "cloud_usage_calls" ("owner_account_id","state");--> statement-breakpoint
CREATE INDEX "cloud_usage_calls_round_state_idx" ON "cloud_usage_calls" ("round_id","state");--> statement-breakpoint
ALTER TABLE "cloud_execution_grants" ADD CONSTRAINT "cloud_execution_grants_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_execution_grants" ADD CONSTRAINT "cloud_execution_grants_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_execution_grants" ADD CONSTRAINT "cloud_execution_grants_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_messages" ADD CONSTRAINT "cloud_messages_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_messages" ADD CONSTRAINT "cloud_messages_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_messages" ADD CONSTRAINT "cloud_messages_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_revisions" ADD CONSTRAINT "cloud_revisions_round_id_cloud_task_rounds_id_fkey" FOREIGN KEY ("round_id") REFERENCES "cloud_task_rounds"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_runs" ADD CONSTRAINT "cloud_runs_round_id_cloud_task_rounds_id_fkey" FOREIGN KEY ("round_id") REFERENCES "cloud_task_rounds"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_spending_grants" ADD CONSTRAINT "cloud_spending_grants_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_spending_grants" ADD CONSTRAINT "cloud_spending_grants_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_spending_grants" ADD CONSTRAINT "cloud_spending_grants_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_task_rounds" ADD CONSTRAINT "cloud_task_rounds_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_task_rounds" ADD CONSTRAINT "cloud_task_rounds_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_task_rounds" ADD CONSTRAINT "cloud_task_rounds_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_task_rounds" ADD CONSTRAINT "cloud_task_rounds_task_id_cloud_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "cloud_tasks"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_usage_calls" ADD CONSTRAINT "cloud_usage_calls_round_id_cloud_task_rounds_id_fkey" FOREIGN KEY ("round_id") REFERENCES "cloud_task_rounds"("id") ON DELETE RESTRICT;