CREATE TYPE "public"."audit_action" AS ENUM('user.status.changed', 'admin.created');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin', 'owner');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"target_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_target_id_idx" ON "audit_events" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_status_role_idx" ON "users" USING btree ("status","role");