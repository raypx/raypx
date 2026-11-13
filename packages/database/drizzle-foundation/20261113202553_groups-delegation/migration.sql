CREATE TABLE "conversation_delegations" (
	"space_id" text,
	"conversation_id" text NOT NULL,
	"parent_run_id" text,
	"tool_call_id" text,
	"child_run_id" text NOT NULL,
	"instruction_revision" integer DEFAULT 0 NOT NULL,
	"fence" bigint DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "conversation_delegations_pkey" PRIMARY KEY("space_id","parent_run_id","tool_call_id"),
	CONSTRAINT "conversation_delegations_state_check" CHECK ("state" in ('pending', 'ready', 'delivered', 'discarded'))
);
--> statement-breakpoint
CREATE TABLE "conversation_message_mentions" (
	"space_id" text,
	"conversation_id" text,
	"message_id" text,
	"agent_id" text,
	"position" integer NOT NULL,
	CONSTRAINT "conversation_message_mentions_pkey" PRIMARY KEY("space_id","conversation_id","message_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"space_id" text,
	"conversation_id" text,
	"agent_id" text,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_participants_pkey" PRIMARY KEY("space_id","conversation_id","agent_id")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "allow_cross_space_messages" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "author_agent_id" text;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "parent_run_id" text;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "delegation_depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "delegation_task" text;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "delegated_allow_shared_memory" boolean;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "instruction_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "computer_held" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "origin_message_id" text;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "agent_chain_depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "untrusted_input" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "default_responder_agent_id" text;--> statement-breakpoint
DROP INDEX "conversations_direct_agent_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_direct_agent_idx" ON "conversations" ("space_id","agent_id") WHERE "kind" = 'direct';--> statement-breakpoint
DROP INDEX "conversation_runs_message_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_runs_message_idx" ON "conversation_runs" ("space_id","conversation_id","message_id","agent_id") WHERE "parent_run_id" is null;--> statement-breakpoint
DROP INDEX "conversation_runs_active_agent_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_runs_active_agent_idx" ON "conversation_runs" ("space_id","agent_id") WHERE "state" in ('running', 'waiting') and "parent_run_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_delegations_child_idx" ON "conversation_delegations" ("space_id","conversation_id","child_run_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_agent_idx" ON "conversation_participants" ("space_id","agent_id");--> statement-breakpoint
ALTER TABLE "conversation_delegations" ADD CONSTRAINT "conversation_delegations_6AKQohdM5emf_fkey" FOREIGN KEY ("space_id","conversation_id","parent_run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_delegations" ADD CONSTRAINT "conversation_delegations_xfb5rSMKKnZj_fkey" FOREIGN KEY ("space_id","conversation_id","child_run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_message_mentions" ADD CONSTRAINT "conversation_message_mentions_TIJFbbjtIJ28_fkey" FOREIGN KEY ("space_id","conversation_id","message_id") REFERENCES "conversation_messages"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_message_mentions" ADD CONSTRAINT "conversation_message_mentions_VUv39vDI5gAu_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_SMMf0biS354z_fkey" FOREIGN KEY ("space_id","author_agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_48Acu1RKMzwv_fkey" FOREIGN KEY ("space_id","conversation_id") REFERENCES "conversations"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_zPRh8oUzGEEH_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_lOBaM63mQaD6_fkey" FOREIGN KEY ("space_id","conversation_id","parent_run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_cM5uW33VZfCG_fkey" FOREIGN KEY ("space_id","conversation_id","origin_message_id") REFERENCES "conversation_messages"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_0uFXgR6BC06S_fkey" FOREIGN KEY ("space_id","default_responder_agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_group_name_check" CHECK ("kind" <> 'group' or "name" is not null);--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_kind_check", ADD CONSTRAINT "conversations_kind_check" CHECK ("kind" in ('direct', 'group'));--> statement-breakpoint
ALTER TABLE "conversation_runs" DROP CONSTRAINT "conversation_runs_trigger_check", ADD CONSTRAINT "conversation_runs_trigger_check" CHECK ("trigger" in ('message', 'routine', 'webhook', 'email', 'agent'));