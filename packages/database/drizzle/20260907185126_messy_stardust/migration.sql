CREATE TYPE "workspace_membership_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "workspace_membership_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"id" text PRIMARY KEY,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_membership_role" DEFAULT 'viewer'::"workspace_membership_role" NOT NULL,
	"status" "workspace_membership_status" DEFAULT 'active'::"workspace_membership_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_memberships_workspace_user_idx" ON "workspace_memberships" ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_memberships_user_id_idx" ON "workspace_memberships" ("user_id");--> statement-breakpoint
CREATE INDEX "workspace_memberships_workspace_status_idx" ON "workspace_memberships" ("workspace_id","status");--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;