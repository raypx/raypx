CREATE TABLE "space_audit" (
	"space_id" text,
	"id" text,
	"operation_id" text NOT NULL,
	"actor_account_id" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text,
	"outcome" text NOT NULL,
	"code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_audit_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "space_audit_outcome_check" CHECK ("outcome" in ('pending', 'succeeded', 'refused', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "space_deletion_jobs" (
	"space_id" text PRIMARY KEY,
	"requested_by_account_id" text NOT NULL,
	"stage" text DEFAULT 'claimed' NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"fence" bigint DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_deletion_jobs_stage_check" CHECK ("stage" in ('claimed', 'runs_cancelled', 'computers_released', 'objects_removed')),
	CONSTRAINT "space_deletion_jobs_lease_check" CHECK (("lease_owner" is null) = ("lease_until" is null))
);
--> statement-breakpoint
CREATE TABLE "space_events" (
	"space_id" text,
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "space_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_events_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "space_events_kind_check" CHECK ("kind" in ('space.member.joined', 'space.member.removed', 'space.member.role_changed', 'space.renamed'))
);
--> statement-breakpoint
CREATE TABLE "space_invitations" (
	"space_id" text,
	"id" text,
	"token_hash" text NOT NULL,
	"inviter_account_id" text NOT NULL,
	"inviter_name" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"consumed_by_account_id" text,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "space_invitations_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "space_invitations_status_check" CHECK ("status" in ('open', 'expired', 'cancelled', 'consumed'))
);
--> statement-breakpoint
CREATE TABLE "space_settings_overrides" (
	"space_id" text PRIMARY KEY,
	"approval_mode" text NOT NULL,
	"updated_by_account_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_settings_overrides_mode_check" CHECK ("approval_mode" in ('ask', 'never'))
);
--> statement-breakpoint
ALTER TABLE "space_members" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "deletion_claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "space_audit_cursor_idx" ON "space_audit" ("space_id","created_at","id");--> statement-breakpoint
CREATE INDEX "space_audit_operation_idx" ON "space_audit" ("space_id","operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_invitations_token_hash_idx" ON "space_invitations" ("token_hash");--> statement-breakpoint
CREATE INDEX "space_invitations_open_idx" ON "space_invitations" ("space_id","status","created_at","id");--> statement-breakpoint
ALTER TABLE "space_audit" ADD CONSTRAINT "space_audit_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_deletion_jobs" ADD CONSTRAINT "space_deletion_jobs_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_events" ADD CONSTRAINT "space_events_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_invitations" ADD CONSTRAINT "space_invitations_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_settings_overrides" ADD CONSTRAINT "space_settings_overrides_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "computers" DROP CONSTRAINT "computers_space_id_spaces_id_fkey", ADD CONSTRAINT "computers_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "computers" DROP CONSTRAINT "computers_space_id_agent_id_agents_space_id_id_fkey", ADD CONSTRAINT "computers_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "computers" DROP CONSTRAINT "computers_ml9XhGwYtCtS_fkey", ADD CONSTRAINT "computers_ml9XhGwYtCtS_fkey" FOREIGN KEY ("space_id","created_by_account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;