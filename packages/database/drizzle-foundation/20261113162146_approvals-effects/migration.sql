CREATE TABLE "approval_requests" (
	"space_id" text,
	"conversation_id" text,
	"id" text,
	"run_id" text NOT NULL,
	"member_account_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"arguments" jsonb NOT NULL,
	"argument_summary" text NOT NULL,
	"target" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"answered_by_account_id" text,
	CONSTRAINT "approval_requests_pkey" PRIMARY KEY("space_id","conversation_id","id"),
	CONSTRAINT "approval_requests_tool_check" CHECK ("tool_name" in ('computer_list_files', 'computer_read_file', 'computer_write_file', 'computer_run_command')),
	CONSTRAINT "approval_requests_state_check" CHECK ("state" in ('pending', 'approved', 'denied', 'expired', 'cancelled')),
	CONSTRAINT "approval_requests_resolution_check" CHECK (("state" = 'pending' and "resolved_at" is null and "answered_by_account_id" is null) or ("state" in ('approved', 'denied') and "resolved_at" is not null and "answered_by_account_id" is not null and "answered_by_account_id" = "member_account_id") or ("state" in ('expired', 'cancelled') and "resolved_at" is not null and "answered_by_account_id" is null)),
	CONSTRAINT "approval_requests_bounds_check" CHECK (length("argument_summary") <= 1024 and length("target") between 1 and 1024 and jsonb_typeof("arguments") = 'object' and length("arguments"::text) <= 262144 and "expires_at" > "created_at")
);
--> statement-breakpoint
CREATE TABLE "approval_rules" (
	"account_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"executable" text,
	"decision" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_rules_action_idx" UNIQUE NULLS NOT DISTINCT("account_id","tool_name","executable"),
	CONSTRAINT "approval_rules_decision_check" CHECK ("decision" in ('allow', 'block')),
	CONSTRAINT "approval_rules_tool_check" CHECK ("tool_name" in ('computer_list_files', 'computer_read_file', 'computer_write_file', 'computer_run_command')),
	CONSTRAINT "approval_rules_executable_check" CHECK (("tool_name" = 'computer_run_command' and "executable" is not null and length("executable") between 1 and 1024) or ("tool_name" <> 'computer_run_command' and "executable" is null))
);
--> statement-breakpoint
CREATE TABLE "approval_settings" (
	"account_id" text PRIMARY KEY,
	"mode" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_settings_mode_check" CHECK ("mode" in ('ask', 'never'))
);
--> statement-breakpoint
CREATE TABLE "conversation_effects" (
	"space_id" text,
	"key" text,
	"conversation_id" text NOT NULL,
	"run_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"argument_hash" text NOT NULL,
	"state" text DEFAULT 'intent' NOT NULL,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "conversation_effects_pkey" PRIMARY KEY("space_id","key"),
	CONSTRAINT "conversation_effects_tool_check" CHECK ("tool_name" in ('computer_write_file', 'computer_run_command')),
	CONSTRAINT "conversation_effects_state_check" CHECK ("state" in ('intent', 'succeeded', 'failed', 'unknown')),
	CONSTRAINT "conversation_effects_key_check" CHECK ("key" ~ '^[a-f0-9]{64}$' and "argument_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "conversation_effects_outcome_check" CHECK (("state" in ('intent', 'unknown') and "result" is null and "completed_at" is null) or ("state" in ('succeeded', 'failed') and "result" is not null and length("result") <= 16384 and "completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "conversation_runs" DROP CONSTRAINT "conversation_runs_wsFZKybYLzme_fkey";--> statement-breakpoint
ALTER TABLE "conversation_events" ADD COLUMN "request_id" text;--> statement-breakpoint
DROP INDEX "conversation_runs_active_agent_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_runs_active_agent_idx" ON "conversation_runs" ("space_id","agent_id") WHERE "state" in ('running', 'waiting');--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_id_idx" ON "approval_requests" ("space_id","id");--> statement-breakpoint
CREATE INDEX "approval_requests_call_idx" ON "approval_requests" ("space_id","conversation_id","run_id","tool_call_id");--> statement-breakpoint
CREATE INDEX "approval_requests_pending_idx" ON "approval_requests" ("space_id","member_account_id","created_at") WHERE "state" = 'pending';--> statement-breakpoint
CREATE INDEX "conversation_effects_run_idx" ON "conversation_effects" ("space_id","conversation_id","run_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_92Eb3hdX1SFr_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_du9yIpRRl4yk_fkey" FOREIGN KEY ("space_id","member_account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_M53VVasRkDeT_fkey" FOREIGN KEY ("space_id","answered_by_account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_settings" ADD CONSTRAINT "approval_settings_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_effects" ADD CONSTRAINT "conversation_effects_J2IU0GLCoiuz_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_rlsvR6Oi5yJY_fkey" FOREIGN KEY ("space_id","conversation_id","request_id") REFERENCES "approval_requests"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_member_account_id_user_id_fkey" FOREIGN KEY ("member_account_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_kind_check", ADD CONSTRAINT "conversation_events_kind_check" CHECK ("kind" in ('message.created', 'run.state', 'reply.segment', 'computer.state', 'card.created', 'card.resolved'));--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_payload_check", ADD CONSTRAINT "conversation_events_payload_check" CHECK ((
      ("kind" = 'message.created' and "message_id" is not null and "run_id" is null and "segment_id" is null and "data" is null and "computer_id" is null and "request_id" is null) or
      ("kind" = 'run.state' and "message_id" is null and "run_id" is not null and "segment_id" is null and "data" is not null and "computer_id" is null and "request_id" is null) or
      ("kind" = 'reply.segment' and "message_id" is null and "run_id" is not null and "segment_id" is not null and "data" is null and "computer_id" is null and "request_id" is null) or
      ("kind" = 'computer.state' and "message_id" is null and "run_id" is null and "segment_id" is null and "computer_id" is not null and "data" is not null and "request_id" is null) or
      ("kind" in ('card.created', 'card.resolved') and "message_id" is null and "run_id" is not null and "segment_id" is null and "computer_id" is null and "request_id" is not null and "data" is not null)
    ));--> statement-breakpoint
ALTER TABLE "conversation_runs" DROP CONSTRAINT "conversation_runs_state_check", ADD CONSTRAINT "conversation_runs_state_check" CHECK ("state" in ('queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled'));