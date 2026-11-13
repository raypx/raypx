CREATE TABLE "conversation_tool_calls" (
	"space_id" text,
	"conversation_id" text NOT NULL,
	"run_id" text,
	"tool_call_id" text,
	"tool_name" text NOT NULL,
	"target" text NOT NULL,
	"argument_summary" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"duration_ms" integer,
	"exit_status" integer,
	"fence" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "conversation_tool_calls_pkey" PRIMARY KEY("space_id","run_id","tool_call_id")
);
--> statement-breakpoint
CREATE TABLE "model_connection_secrets" (
	"id" text PRIMARY KEY,
	"connection_id" text NOT NULL,
	"account_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"wrapped_data_key" text NOT NULL,
	"key_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_connection_spaces" (
	"connection_id" text,
	"account_id" text NOT NULL,
	"space_id" text,
	CONSTRAINT "model_connection_spaces_pkey" PRIMARY KEY("connection_id","space_id")
);
--> statement-breakpoint
CREATE TABLE "model_connections" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"base_url" text,
	"api" text,
	"models" jsonb NOT NULL,
	"availability" text NOT NULL,
	"secret_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_connections_secret_owner_idx" UNIQUE("id","account_id","secret_id"),
	CONSTRAINT "model_connections_owner_idx" UNIQUE("id","account_id"),
	CONSTRAINT "model_connections_kind_check" CHECK ("kind" in ('anthropic', 'openai', 'google', 'openrouter', 'compatible')),
	CONSTRAINT "model_connections_availability_check" CHECK ("availability" in ('all', 'selected')),
	CONSTRAINT "model_connections_protocol_check" CHECK (("kind" = 'compatible' and "base_url" is not null and "api" in ('anthropic-messages', 'openai-completions', 'openai-responses')) or ("kind" <> 'compatible' and "base_url" is null and "api" is null))
);
--> statement-breakpoint
ALTER TABLE "approval_settings" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "conversation_tool_calls_snapshot_idx" ON "conversation_tool_calls" ("space_id","conversation_id","started_at","run_id","tool_call_id");--> statement-breakpoint
CREATE INDEX "model_connection_secrets_owner_idx" ON "model_connection_secrets" ("account_id","connection_id");--> statement-breakpoint
CREATE INDEX "model_connection_spaces_member_idx" ON "model_connection_spaces" ("space_id","account_id","connection_id");--> statement-breakpoint
CREATE INDEX "model_connections_account_idx" ON "model_connections" ("account_id","created_at","id");--> statement-breakpoint
ALTER TABLE "conversation_tool_calls" ADD CONSTRAINT "conversation_tool_calls_Lr03ldh2liAD_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "model_connection_secrets" ADD CONSTRAINT "model_connection_secrets_zwLfvrb9T99G_fkey" FOREIGN KEY ("connection_id","account_id","id") REFERENCES "model_connections"("id","account_id","secret_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "model_connection_spaces" ADD CONSTRAINT "model_connection_spaces_jXKIgGxj90Yh_fkey" FOREIGN KEY ("connection_id","account_id") REFERENCES "model_connections"("id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "model_connection_spaces" ADD CONSTRAINT "model_connection_spaces_zvgSVo4ZE3Bl_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "model_connections" ADD CONSTRAINT "model_connections_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_kind_check", ADD CONSTRAINT "conversation_events_kind_check" CHECK ("kind" in ('message.created', 'run.state', 'reply.segment', 'computer.state', 'card.created', 'card.resolved', 'tool.started', 'tool.finished'));--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_payload_check", ADD CONSTRAINT "conversation_events_payload_check" CHECK ((
      ("kind" = 'message.created' and "message_id" is not null and "run_id" is null and "segment_id" is null and "data" is null and "computer_id" is null and "request_id" is null) or
      ("kind" = 'run.state' and "message_id" is null and "run_id" is not null and "segment_id" is null and "data" is not null and "computer_id" is null and "request_id" is null) or
      ("kind" = 'reply.segment' and "message_id" is null and "run_id" is not null and "segment_id" is not null and "data" is null and "computer_id" is null and "request_id" is null) or
      ("kind" = 'computer.state' and "message_id" is null and "run_id" is null and "segment_id" is null and "computer_id" is not null and "data" is not null and "request_id" is null) or
      ("kind" in ('tool.started', 'tool.finished') and "message_id" is null and "run_id" is not null and "segment_id" is null and "computer_id" is null and "request_id" is null and "data" is not null) or
      ("kind" in ('card.created', 'card.resolved') and "message_id" is null and "run_id" is not null and "segment_id" is null and "computer_id" is null and "request_id" is not null and "data" is not null)
    ));