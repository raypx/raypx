CREATE TABLE "conversation_run_memory_pins" (
	"space_id" text,
	"conversation_id" text,
	"run_id" text,
	"document_id" text,
	"revision" integer,
	"position" integer NOT NULL,
	CONSTRAINT "conversation_run_memory_pins_pkey" PRIMARY KEY("space_id","conversation_id","run_id","document_id","revision"),
	CONSTRAINT "conversation_run_memory_pins_position_check" CHECK ("position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "routine_deliveries" (
	"space_id" text,
	"routine_id" text,
	"kind" text,
	"id" text,
	"body_digest" text NOT NULL,
	"occurrence_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "routine_deliveries_pkey" PRIMARY KEY("space_id","routine_id","kind","id"),
	CONSTRAINT "routine_deliveries_kind_check" CHECK ("kind" in ('manual', 'webhook', 'email', 'repository'))
);
--> statement-breakpoint
CREATE TABLE "routine_events" (
	"space_id" text,
	"routine_id" text,
	"id" text,
	"kind" text NOT NULL,
	"occurrence_id" text NOT NULL,
	"run_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"fired_at" timestamp with time zone NOT NULL,
	CONSTRAINT "routine_events_pkey" PRIMARY KEY("space_id","routine_id","id"),
	CONSTRAINT "routine_events_kind_check" CHECK ("kind" in ('routine.fired', 'routine.coalesced'))
);
--> statement-breakpoint
CREATE TABLE "routine_identities" (
	"space_id" text,
	"id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_identities_pkey" PRIMARY KEY("space_id","id")
);
--> statement-breakpoint
CREATE TABLE "routine_occurrences" (
	"space_id" text,
	"routine_id" text,
	"id" text,
	"kind" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"run_id" text,
	"conversation_id" text,
	CONSTRAINT "routine_occurrences_pkey" PRIMARY KEY("space_id","routine_id","id"),
	CONSTRAINT "routine_occurrences_kind_check" CHECK ("kind" in ('schedule', 'manual', 'webhook', 'email', 'repository')),
	CONSTRAINT "routine_occurrences_status_check" CHECK ("status" in ('fired', 'coalesced', 'ignored')),
	CONSTRAINT "routine_occurrences_run_check" CHECK (("run_id" is null) = ("conversation_id" is null))
);
--> statement-breakpoint
CREATE TABLE "routine_secrets" (
	"space_id" text,
	"routine_id" text,
	"id" text NOT NULL,
	"account_id" text NOT NULL,
	"key_id" text NOT NULL,
	"wrapped_data_key" text NOT NULL,
	"ciphertext" text NOT NULL,
	CONSTRAINT "routine_secrets_pkey" PRIMARY KEY("space_id","routine_id")
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"space_id" text,
	"id" text,
	"agent_id" text NOT NULL,
	"owner_account_id" text NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"triggers" jsonb NOT NULL,
	"webhook_digest" text,
	"email_address" text,
	"next_due_at" timestamp with time zone,
	"rate_window_at" timestamp with time zone,
	"rate_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routines_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "routines_rate_count_check" CHECK ("rate_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "space_memory_documents" (
	"space_id" text,
	"id" text,
	"scope" text NOT NULL,
	"agent_id" text,
	"title" text NOT NULL,
	"text" text,
	"pinned" boolean DEFAULT false NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"attribution" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"author_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_memory_documents_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "space_memory_scope_check" CHECK (("scope" = 'agent' and "agent_id" is not null) or ("scope" = 'space' and "agent_id" is null)),
	CONSTRAINT "space_memory_removed_check" CHECK (("removed" and "text" is null) or (not "removed" and "text" is not null)),
	CONSTRAINT "space_memory_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "space_memory_revisions" (
	"space_id" text,
	"document_id" text,
	"revision" integer,
	"reason" text NOT NULL,
	"body" jsonb NOT NULL,
	"mutation_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_memory_revisions_pkey" PRIMARY KEY("space_id","document_id","revision"),
	CONSTRAINT "space_memory_revision_body_identity_check" CHECK (coalesce(
      ("body"->>'spaceId') = "space_id" and
      ("body"->>'id') = "document_id" and
      ("body"->>'revision') = "revision"::text, false))
);
--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_du9yIpRRl4yk_fkey";--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_M53VVasRkDeT_fkey";--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_rlsvR6Oi5yJY_fkey";--> statement-breakpoint
ALTER TABLE "conversation_runs" DROP CONSTRAINT "conversation_runs_member_account_id_user_id_fkey";--> statement-breakpoint
ALTER TABLE "conversation_messages" DROP CONSTRAINT "conversation_messages_author_account_id_user_id_fkey";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "allow_shared_memory" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "routine_id" text;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "routine_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "routine_timezone" text;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "inbound_content" text;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "inbound_provenance" jsonb;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "inbound_routine_id" text GENERATED ALWAYS AS (inbound_provenance ->> 'routineId') STORED;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_event_ref_idx" ON "approval_requests" ("space_id","conversation_id","run_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_run_memory_pins_position_idx" ON "conversation_run_memory_pins" ("space_id","conversation_id","run_id","position");--> statement-breakpoint
CREATE INDEX "conversation_run_memory_pins_source_idx" ON "conversation_run_memory_pins" ("space_id","document_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_runs_actor_idx" ON "conversation_runs" ("space_id","conversation_id","id","member_account_id");--> statement-breakpoint
CREATE INDEX "conversation_runs_routine_idx" ON "conversation_runs" ("space_id","routine_id");--> statement-breakpoint
CREATE INDEX "conversation_runs_inbound_routine_idx" ON "conversation_runs" ("space_id","inbound_routine_id");--> statement-breakpoint
CREATE INDEX "routine_events_run_idx" ON "routine_events" ("space_id","conversation_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_occurrences_event_ref_idx" ON "routine_occurrences" ("space_id","routine_id","id","conversation_id","run_id");--> statement-breakpoint
CREATE INDEX "routine_occurrences_history_idx" ON "routine_occurrences" ("space_id","routine_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "routines_ingress_id_idx" ON "routines" ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "routines_email_idx" ON "routines" ("email_address");--> statement-breakpoint
CREATE INDEX "routines_due_idx" ON "routines" ("enabled","next_due_at","id");--> statement-breakpoint
CREATE INDEX "routines_agent_idx" ON "routines" ("space_id","agent_id","created_at","id");--> statement-breakpoint
CREATE INDEX "space_memory_recall_idx" ON "space_memory_documents" ("space_id","agent_id","pinned","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_memory_mutation_idx" ON "space_memory_revisions" ("space_id","mutation_key") WHERE "mutation_key" is not null;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_NyTlPyvU1bAr_fkey" FOREIGN KEY ("space_id","conversation_id","run_id","member_account_id") REFERENCES "conversation_runs"("space_id","conversation_id","id","member_account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_MO9IML6PoB8W_fkey" FOREIGN KEY ("space_id","conversation_id","run_id","answered_by_account_id") REFERENCES "conversation_runs"("space_id","conversation_id","id","member_account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_fYBbkMzqoYc2_fkey" FOREIGN KEY ("space_id","conversation_id","run_id","request_id") REFERENCES "approval_requests"("space_id","conversation_id","run_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_memory_pins" ADD CONSTRAINT "conversation_run_memory_pins_RNdJnDBf7vR2_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_run_checkpoints"("space_id","conversation_id","run_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_memory_pins" ADD CONSTRAINT "conversation_run_memory_pins_tzicmTIle9Ck_fkey" FOREIGN KEY ("space_id","document_id","revision") REFERENCES "space_memory_revisions"("space_id","document_id","revision") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_jdFotloXl8JH_fkey" FOREIGN KEY ("space_id","routine_id") REFERENCES "routine_identities"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_3dHr38gNXeJx_fkey" FOREIGN KEY ("space_id","inbound_routine_id") REFERENCES "routine_identities"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routine_deliveries" ADD CONSTRAINT "routine_deliveries_EeSVBPayrLDN_fkey" FOREIGN KEY ("space_id","routine_id","occurrence_id") REFERENCES "routine_occurrences"("space_id","routine_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routine_events" ADD CONSTRAINT "routine_events_qLqIQAOmCo5u_fkey" FOREIGN KEY ("space_id","routine_id","occurrence_id","conversation_id","run_id") REFERENCES "routine_occurrences"("space_id","routine_id","id","conversation_id","run_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routine_events" ADD CONSTRAINT "routine_events_84fGpONFbGNB_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routine_identities" ADD CONSTRAINT "routine_identities_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routine_occurrences" ADD CONSTRAINT "routine_occurrences_cVZpPLiRcOgC_fkey" FOREIGN KEY ("space_id","routine_id") REFERENCES "routines"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routine_occurrences" ADD CONSTRAINT "routine_occurrences_gOMhmsotf64S_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routine_secrets" ADD CONSTRAINT "routine_secrets_space_id_routine_id_routines_space_id_id_fkey" FOREIGN KEY ("space_id","routine_id") REFERENCES "routines"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routine_secrets" ADD CONSTRAINT "routine_secrets_5lOnvtjchMLR_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_space_id_id_routine_identities_space_id_id_fkey" FOREIGN KEY ("space_id","id") REFERENCES "routine_identities"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_QoSzyQZs5D4Y_fkey" FOREIGN KEY ("space_id","owner_account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_memory_documents" ADD CONSTRAINT "space_memory_documents_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_memory_documents" ADD CONSTRAINT "space_memory_documents_author_account_id_user_id_fkey" FOREIGN KEY ("author_account_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "space_memory_documents" ADD CONSTRAINT "space_memory_documents_8g0Pvw6psJ4k_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_memory_revisions" ADD CONSTRAINT "space_memory_revisions_9dTkS43ipnir_fkey" FOREIGN KEY ("space_id","document_id") REFERENCES "space_memory_documents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_checkpoints" ADD CONSTRAINT "conversation_run_checkpoints_memory_refs_check" CHECK (not coalesce(("data"->'memory') ? 'revisions', false));--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_inbound_routine_check" CHECK ("inbound_provenance" is null or ("inbound_routine_id" is not null and "routine_id" is not null and "inbound_routine_id" = "routine_id"));--> statement-breakpoint
ALTER TABLE "conversation_runs" DROP CONSTRAINT "conversation_runs_trigger_check", ADD CONSTRAINT "conversation_runs_trigger_check" CHECK ("trigger" in ('message', 'routine', 'webhook', 'email'));--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_tool_check", ADD CONSTRAINT "approval_requests_tool_check" CHECK ("tool_name" in ('computer_list_files', 'computer_read_file', 'computer_write_file', 'computer_run_command', 'agent_memory_save', 'agent_memory_update'));--> statement-breakpoint
ALTER TABLE "approval_rules" DROP CONSTRAINT "approval_rules_tool_check", ADD CONSTRAINT "approval_rules_tool_check" CHECK ("tool_name" in ('computer_list_files', 'computer_read_file', 'computer_write_file', 'computer_run_command', 'agent_memory_save', 'agent_memory_update'));--> statement-breakpoint
ALTER TABLE "conversation_effects" DROP CONSTRAINT "conversation_effects_tool_check", ADD CONSTRAINT "conversation_effects_tool_check" CHECK ("tool_name" in ('computer_write_file', 'computer_run_command', 'agent_memory_save', 'agent_memory_update'));