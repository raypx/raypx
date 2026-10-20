CREATE TYPE "project_member_role" AS ENUM('owner', 'editor', 'commenter', 'viewer');--> statement-breakpoint
CREATE TYPE "project_member_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "project_member_role" NOT NULL,
	"status" "project_member_status" DEFAULT 'active'::"project_member_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_project_id_user_id_idx" ON "project_members" ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_members_project_id_status_idx" ON "project_members" ("project_id","status");--> statement-breakpoint
CREATE INDEX "project_members_workspace_id_user_id_idx" ON "project_members" ("workspace_id","user_id");--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;