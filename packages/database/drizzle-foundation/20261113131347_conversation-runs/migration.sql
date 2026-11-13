CREATE TABLE "conversation_reply_segments" (
	"space_id" text,
	"conversation_id" text,
	"id" text,
	"run_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_reply_segments_pkey" PRIMARY KEY("space_id","conversation_id","id")
);
--> statement-breakpoint
CREATE TABLE "conversation_runs" (
	"space_id" text,
	"conversation_id" text,
	"id" text,
	"agent_id" text NOT NULL,
	"trigger" text DEFAULT 'message' NOT NULL,
	"message_id" text NOT NULL,
	"message_sequence" bigint NOT NULL,
	"member_account_id" text NOT NULL,
	"model_id" text NOT NULL,
	"instructions" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "conversation_runs_pkey" PRIMARY KEY("space_id","conversation_id","id"),
	CONSTRAINT "conversation_runs_state_check" CHECK ("state" in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "conversation_runs_trigger_check" CHECK ("trigger" = 'message')
);
--> statement-breakpoint
ALTER TABLE "conversation_events" ADD COLUMN "data" jsonb;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD COLUMN "segment_id" text;--> statement-breakpoint
ALTER TABLE "conversation_events" ALTER COLUMN "message_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_reply_segments_sequence_idx" ON "conversation_reply_segments" ("space_id","conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_runs_message_idx" ON "conversation_runs" ("space_id","conversation_id","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_runs_active_agent_idx" ON "conversation_runs" ("space_id","agent_id") WHERE "state" = 'running';--> statement-breakpoint
CREATE INDEX "conversation_runs_queue_idx" ON "conversation_runs" ("space_id","conversation_id","state","message_sequence");--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_QDw4cP3SFQQc_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_jYPcAyFq6yhV_fkey" FOREIGN KEY ("space_id","conversation_id","segment_id") REFERENCES "conversation_reply_segments"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_reply_segments" ADD CONSTRAINT "conversation_reply_segments_H7AN6GazxOJO_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_wsFZKybYLzme_fkey" FOREIGN KEY ("space_id","member_account_id") REFERENCES "space_members"("space_id","account_id");--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_NWMFOmdgHUcX_fkey" FOREIGN KEY ("space_id","conversation_id","message_id","message_sequence") REFERENCES "conversation_messages"("space_id","conversation_id","id","sequence") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_payload_check" CHECK ((
      ("kind" = 'message.created' and "message_id" is not null and "run_id" is null and "segment_id" is null and "data" is null) or
      ("kind" = 'run.state' and "message_id" is null and "run_id" is not null and "segment_id" is null and "data" is not null) or
      ("kind" = 'reply.segment' and "message_id" is null and "run_id" is not null and "segment_id" is not null and "data" is null)
    ));--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_kind_check", ADD CONSTRAINT "conversation_events_kind_check" CHECK ("kind" in ('message.created', 'run.state', 'reply.segment'));