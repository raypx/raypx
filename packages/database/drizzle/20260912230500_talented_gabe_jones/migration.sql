CREATE TYPE "v2_project_member_role" AS ENUM('editor', 'commenter', 'viewer');--> statement-breakpoint
CREATE TYPE "v2_project_member_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TABLE "project_members_v2" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "v2_project_member_role" NOT NULL,
	"status" "v2_project_member_status" DEFAULT 'active'::"v2_project_member_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks_v2" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"status" "project_task_status" DEFAULT 'todo'::"project_task_status" NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects_v2" (
	"id" text PRIMARY KEY,
	"created_by_user_id" text NOT NULL,
	"personal_owner_id" text,
	"organization_id" text,
	"title" text NOT NULL,
	"description" text,
	"stage" "project_stage" DEFAULT 'draft'::"project_stage" NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"deadline" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_v2_single_owner_scope" CHECK ((("personal_owner_id" IS NOT NULL)::int + ("organization_id" IS NOT NULL)::int) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_v2_project_user_idx" ON "project_members_v2" ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_members_v2_user_status_idx" ON "project_members_v2" ("user_id","status");--> statement-breakpoint
CREATE INDEX "project_tasks_v2_project_updated_idx" ON "project_tasks_v2" ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "projects_v2_personal_owner_updated_idx" ON "projects_v2" ("personal_owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "projects_v2_organization_updated_idx" ON "projects_v2" ("organization_id","updated_at");--> statement-breakpoint
ALTER TABLE "project_members_v2" ADD CONSTRAINT "project_members_v2_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_members_v2" ADD CONSTRAINT "project_members_v2_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_tasks_v2" ADD CONSTRAINT "project_tasks_v2_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_tasks_v2" ADD CONSTRAINT "project_tasks_v2_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "projects_v2" ADD CONSTRAINT "projects_v2_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "projects_v2" ADD CONSTRAINT "projects_v2_personal_owner_id_users_id_fkey" FOREIGN KEY ("personal_owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "projects_v2" ADD CONSTRAINT "projects_v2_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;