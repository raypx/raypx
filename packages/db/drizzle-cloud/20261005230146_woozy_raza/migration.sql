CREATE TYPE "audit_action" AS ENUM('user.status.changed', 'admin.created', 'system.settings.updated', 'system.mail.test.sent');--> statement-breakpoint
CREATE TYPE "audit_target_type" AS ENUM('user', 'system_setting');--> statement-breakpoint
CREATE TYPE "organization_membership_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TYPE "organization_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "project_stage" AS ENUM('draft', 'in_progress', 'review', 'delivered');--> statement-breakpoint
CREATE TYPE "project_task_status" AS ENUM('todo', 'in_progress', 'blocked', 'done');--> statement-breakpoint
CREATE TYPE "role" AS ENUM('user', 'admin', 'owner');--> statement-breakpoint
CREATE TYPE "user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "v2_project_member_role" AS ENUM('editor', 'commenter', 'viewer');--> statement-breakpoint
CREATE TYPE "v2_project_member_status" AS ENUM('active', 'removed');--> statement-breakpoint
CREATE TYPE "review_status_v2" AS ENUM('open', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "cloud_command_status" AS ENUM('pending', 'applied', 'rejected');--> statement-breakpoint
CREATE TYPE "cloud_run_status" AS ENUM('queued', 'running', 'needs_input', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "cloud_task_status" AS ENUM('open', 'in_progress', 'waiting_input', 'review', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "cloud_tool_status" AS ENUM('running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "cloud_usage_state" AS ENUM('reserved', 'started', 'settled', 'unknown', 'released');--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"leased_until" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities_v2" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY,
	"actor_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"target_type" "audit_target_type" DEFAULT 'user'::"audit_target_type" NOT NULL,
	"target_id" text NOT NULL,
	"target_user_id" text GENERATED ALWAYS AS (case when "target_type" = 'user' then "target_id" else null end) STORED,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY,
	"issuer" text DEFAULT 'voidmix' NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_secrets" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" text PRIMARY KEY,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY,
	"email" text NOT NULL UNIQUE,
	"display_name" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role" DEFAULT 'user'::"role" NOT NULL,
	"status" "user_status" DEFAULT 'active'::"user_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "organization_role" DEFAULT 'viewer'::"organization_role" NOT NULL,
	"status" "organization_membership_status" DEFAULT 'active'::"organization_membership_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "cloud_assets" (
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
	CONSTRAINT "cloud_assets_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_commands" (
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
	CONSTRAINT "cloud_commands_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_conversations" (
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
	CONSTRAINT "cloud_conversations_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_events" (
	"run_id" text,
	"sequence" integer,
	"event_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "cloud_events_pkey" PRIMARY KEY("run_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "cloud_executions" (
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
	CONSTRAINT "cloud_executions_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_mutations" (
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
	CONSTRAINT "cloud_mutations_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_notifications" (
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
	CONSTRAINT "cloud_notifications_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_preferences" (
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
	CONSTRAINT "cloud_preferences_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_revisions" (
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
	CONSTRAINT "cloud_revisions_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_runs" (
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
	"task_id" text,
	"conversation_id" text NOT NULL,
	"status" "cloud_run_status" NOT NULL,
	"dispatch_ready" boolean NOT NULL,
	"owner_id" text,
	"epoch" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_sources" (
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
	CONSTRAINT "cloud_sources_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_tasks" (
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
	"status" "cloud_task_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_tools" (
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
	CONSTRAINT "cloud_tools_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_turns" (
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
	CONSTRAINT "cloud_turns_scope_check" CHECK (("scope_type"='personal' AND "owner_user_id" IS NOT NULL AND "project_id" IS NULL) OR ("scope_type"='project' AND "owner_user_id" IS NULL AND "project_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cloud_usage_calls" (
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
	"run_id" text NOT NULL,
	"state" "cloud_usage_state" NOT NULL
);
--> statement-breakpoint
CREATE INDEX "outbox_events_available_idx" ON "outbox_events" ("available_at","leased_until");--> statement-breakpoint
CREATE INDEX "outbox_events_delivered_idx" ON "outbox_events" ("delivered_at");--> statement-breakpoint
CREATE INDEX "activities_v2_project_occurred_idx" ON "activities_v2" ("project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "asset_versions_v2_object_key_idx" ON "asset_versions_v2" ("object_key");--> statement-breakpoint
CREATE INDEX "asset_versions_v2_project_created_idx" ON "asset_versions_v2" ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_v2_project_updated_idx" ON "assets_v2" ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "feedback_v2_review_created_idx" ON "feedback_v2" ("review_id","created_at");--> statement-breakpoint
CREATE INDEX "reviews_v2_project_updated_idx" ON "reviews_v2" ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_id_idx" ON "audit_events" ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_id_idx" ON "audit_events" ("target_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_user_id_idx" ON "audit_events" ("target_user_id");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_account_idx" ON "auth_accounts" ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" ("identifier");--> statement-breakpoint
CREATE INDEX "system_secrets_updated_by_idx" ON "system_secrets" ("updated_by");--> statement-breakpoint
CREATE INDEX "system_settings_updated_by_idx" ON "system_settings" ("updated_by");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" ("created_at");--> statement-breakpoint
CREATE INDEX "users_status_role_idx" ON "users" ("status","role");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_members_organization_user_idx" ON "organization_members" ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_members_user_status_idx" ON "organization_members" ("user_id","status");--> statement-breakpoint
CREATE INDEX "organizations_created_by_user_id_idx" ON "organizations" ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_v2_project_user_idx" ON "project_members_v2" ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_members_v2_user_status_idx" ON "project_members_v2" ("user_id","status");--> statement-breakpoint
CREATE INDEX "project_tasks_v2_project_updated_idx" ON "project_tasks_v2" ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "projects_v2_personal_owner_updated_idx" ON "projects_v2" ("personal_owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "projects_v2_organization_updated_idx" ON "projects_v2" ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "cloud_assets_scope_created_idx" ON "cloud_assets" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_assets_parent_idx" ON "cloud_assets" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_assets_secondary_parent_idx" ON "cloud_assets" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_assets_actor_idx" ON "cloud_assets" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_assets_actor_intent_idx" ON "cloud_assets" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_commands_scope_created_idx" ON "cloud_commands" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_commands_parent_idx" ON "cloud_commands" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_commands_secondary_parent_idx" ON "cloud_commands" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_commands_actor_idx" ON "cloud_commands" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_commands_actor_intent_idx" ON "cloud_commands" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_conversations_scope_created_idx" ON "cloud_conversations" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_conversations_parent_idx" ON "cloud_conversations" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_conversations_secondary_parent_idx" ON "cloud_conversations" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_conversations_actor_idx" ON "cloud_conversations" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_conversations_actor_intent_idx" ON "cloud_conversations" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_events_run_event_idx" ON "cloud_events" ("run_id","event_id");--> statement-breakpoint
CREATE INDEX "cloud_executions_scope_created_idx" ON "cloud_executions" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_executions_parent_idx" ON "cloud_executions" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_executions_secondary_parent_idx" ON "cloud_executions" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_executions_actor_idx" ON "cloud_executions" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_executions_actor_intent_idx" ON "cloud_executions" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_mutations_scope_created_idx" ON "cloud_mutations" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_mutations_parent_idx" ON "cloud_mutations" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_mutations_secondary_parent_idx" ON "cloud_mutations" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_mutations_actor_idx" ON "cloud_mutations" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_mutations_actor_intent_idx" ON "cloud_mutations" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_notifications_scope_created_idx" ON "cloud_notifications" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_notifications_parent_idx" ON "cloud_notifications" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_notifications_secondary_parent_idx" ON "cloud_notifications" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_notifications_actor_idx" ON "cloud_notifications" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_notifications_actor_intent_idx" ON "cloud_notifications" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_preferences_scope_created_idx" ON "cloud_preferences" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_preferences_parent_idx" ON "cloud_preferences" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_preferences_secondary_parent_idx" ON "cloud_preferences" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_preferences_actor_idx" ON "cloud_preferences" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_preferences_actor_intent_idx" ON "cloud_preferences" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_revisions_scope_created_idx" ON "cloud_revisions" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_revisions_parent_idx" ON "cloud_revisions" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_revisions_secondary_parent_idx" ON "cloud_revisions" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_revisions_actor_idx" ON "cloud_revisions" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_revisions_actor_intent_idx" ON "cloud_revisions" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_runs_actor_intent_idx" ON "cloud_runs" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_runs_active_task_idx" ON "cloud_runs" ("task_id") WHERE "status" IN ('queued','running');--> statement-breakpoint
CREATE INDEX "cloud_runs_dispatch_idx" ON "cloud_runs" ("status","dispatch_ready","created_at");--> statement-breakpoint
CREATE INDEX "cloud_runs_conversation_idx" ON "cloud_runs" ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_runs_owner_idx" ON "cloud_runs" ("owner_id");--> statement-breakpoint
CREATE INDEX "cloud_runs_actor_idx" ON "cloud_runs" ("actor_id");--> statement-breakpoint
CREATE INDEX "cloud_runs_task_idx" ON "cloud_runs" ("task_id");--> statement-breakpoint
CREATE INDEX "cloud_sources_scope_created_idx" ON "cloud_sources" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_sources_parent_idx" ON "cloud_sources" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_sources_secondary_parent_idx" ON "cloud_sources" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_sources_actor_idx" ON "cloud_sources" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_sources_actor_intent_idx" ON "cloud_sources" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_tasks_scope_idx" ON "cloud_tasks" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_tasks_actor_intent_idx" ON "cloud_tasks" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_tools_scope_created_idx" ON "cloud_tools" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_tools_parent_idx" ON "cloud_tools" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_tools_secondary_parent_idx" ON "cloud_tools" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_tools_actor_idx" ON "cloud_tools" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_tools_actor_intent_idx" ON "cloud_tools" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_turns_scope_created_idx" ON "cloud_turns" ("scope_type","owner_user_id","project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_turns_parent_idx" ON "cloud_turns" ("parent_id");--> statement-breakpoint
CREATE INDEX "cloud_turns_secondary_parent_idx" ON "cloud_turns" ("secondary_parent_id");--> statement-breakpoint
CREATE INDEX "cloud_turns_actor_idx" ON "cloud_turns" ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_turns_actor_intent_idx" ON "cloud_turns" ("actor_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cloud_usage_calls_actor_state_idx" ON "cloud_usage_calls" ("actor_id","state");--> statement-breakpoint
CREATE INDEX "cloud_usage_calls_run_idx" ON "cloud_usage_calls" ("run_id");--> statement-breakpoint
ALTER TABLE "activities_v2" ADD CONSTRAINT "activities_v2_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activities_v2" ADD CONSTRAINT "activities_v2_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
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
ALTER TABLE "reviews_v2" ADD CONSTRAINT "reviews_v2_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_user_id_users_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "system_secrets" ADD CONSTRAINT "system_secrets_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "project_members_v2" ADD CONSTRAINT "project_members_v2_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_members_v2" ADD CONSTRAINT "project_members_v2_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_tasks_v2" ADD CONSTRAINT "project_tasks_v2_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_tasks_v2" ADD CONSTRAINT "project_tasks_v2_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "projects_v2" ADD CONSTRAINT "projects_v2_created_by_user_id_users_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "projects_v2" ADD CONSTRAINT "projects_v2_personal_owner_id_users_id_fkey" FOREIGN KEY ("personal_owner_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "projects_v2" ADD CONSTRAINT "projects_v2_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_assets" ADD CONSTRAINT "cloud_assets_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_assets" ADD CONSTRAINT "cloud_assets_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_assets" ADD CONSTRAINT "cloud_assets_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_commands" ADD CONSTRAINT "cloud_commands_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_commands" ADD CONSTRAINT "cloud_commands_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_commands" ADD CONSTRAINT "cloud_commands_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_conversations" ADD CONSTRAINT "cloud_conversations_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_conversations" ADD CONSTRAINT "cloud_conversations_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_conversations" ADD CONSTRAINT "cloud_conversations_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_events" ADD CONSTRAINT "cloud_events_run_id_cloud_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "cloud_runs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cloud_executions" ADD CONSTRAINT "cloud_executions_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_executions" ADD CONSTRAINT "cloud_executions_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_executions" ADD CONSTRAINT "cloud_executions_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_mutations" ADD CONSTRAINT "cloud_mutations_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_mutations" ADD CONSTRAINT "cloud_mutations_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_mutations" ADD CONSTRAINT "cloud_mutations_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_notifications" ADD CONSTRAINT "cloud_notifications_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_notifications" ADD CONSTRAINT "cloud_notifications_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_notifications" ADD CONSTRAINT "cloud_notifications_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_preferences" ADD CONSTRAINT "cloud_preferences_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_preferences" ADD CONSTRAINT "cloud_preferences_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_preferences" ADD CONSTRAINT "cloud_preferences_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_revisions" ADD CONSTRAINT "cloud_revisions_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_revisions" ADD CONSTRAINT "cloud_revisions_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_revisions" ADD CONSTRAINT "cloud_revisions_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_runs" ADD CONSTRAINT "cloud_runs_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_runs" ADD CONSTRAINT "cloud_runs_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_runs" ADD CONSTRAINT "cloud_runs_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_runs" ADD CONSTRAINT "cloud_runs_task_id_cloud_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "cloud_tasks"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_runs" ADD CONSTRAINT "cloud_runs_conversation_id_cloud_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "cloud_conversations"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_sources" ADD CONSTRAINT "cloud_sources_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_sources" ADD CONSTRAINT "cloud_sources_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_sources" ADD CONSTRAINT "cloud_sources_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_tasks" ADD CONSTRAINT "cloud_tasks_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_tasks" ADD CONSTRAINT "cloud_tasks_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_tasks" ADD CONSTRAINT "cloud_tasks_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_tools" ADD CONSTRAINT "cloud_tools_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_tools" ADD CONSTRAINT "cloud_tools_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_tools" ADD CONSTRAINT "cloud_tools_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_turns" ADD CONSTRAINT "cloud_turns_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_turns" ADD CONSTRAINT "cloud_turns_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_turns" ADD CONSTRAINT "cloud_turns_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_usage_calls" ADD CONSTRAINT "cloud_usage_calls_owner_user_id_users_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_usage_calls" ADD CONSTRAINT "cloud_usage_calls_project_id_projects_v2_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects_v2"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_usage_calls" ADD CONSTRAINT "cloud_usage_calls_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "cloud_usage_calls" ADD CONSTRAINT "cloud_usage_calls_run_id_cloud_runs_id_fkey" FOREIGN KEY ("run_id") REFERENCES "cloud_runs"("id") ON DELETE RESTRICT;