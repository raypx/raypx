CREATE TABLE "computers" (
	"space_id" text,
	"id" text,
	"scope" text NOT NULL,
	"agent_id" text,
	"created_by_account_id" text NOT NULL,
	"provider" text NOT NULL,
	"state" text DEFAULT 'stopped' NOT NULL,
	"generation" bigint DEFAULT 1 NOT NULL,
	"home_revision" text,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"lease_fence" bigint DEFAULT 0 NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "computers_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "computers_scope_check" CHECK (("scope" = 'team' and "agent_id" is null) or ("scope" = 'private' and "agent_id" is not null)),
	CONSTRAINT "computers_provider_check" CHECK ("provider" in ('memory', 'sandbox')),
	CONSTRAINT "computers_state_check" CHECK ("state" in ('stopped', 'starting', 'running', 'stopping', 'failed', 'destroyed')),
	CONSTRAINT "computers_generation_check" CHECK ("generation" > 0 and "generation" <= 9007199254740991 and "lease_fence" >= 0 and "lease_fence" <= 9007199254740991),
	CONSTRAINT "computers_revision_check" CHECK ("home_revision" is null or "home_revision" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "computers_lease_check" CHECK (("lease_owner" is null) = ("lease_expires_at" is null)),
	CONSTRAINT "computers_failure_check" CHECK (("state" = 'failed' and "failure_code" is not null and "failure_code" in ('PROVIDER_UNAVAILABLE', 'RESTORE_FAILED')) or ("state" <> 'failed' and "failure_code" is null))
);
--> statement-breakpoint
ALTER TABLE "conversation_events" ADD COLUMN "computer_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "computers_team_idx" ON "computers" ("space_id") WHERE "scope" = 'team';--> statement-breakpoint
CREATE UNIQUE INDEX "computers_private_agent_idx" ON "computers" ("space_id","agent_id") WHERE "scope" = 'private';--> statement-breakpoint
CREATE INDEX "computers_creator_idx" ON "computers" ("created_by_account_id");--> statement-breakpoint
ALTER TABLE "computers" ADD CONSTRAINT "computers_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id");--> statement-breakpoint
ALTER TABLE "computers" ADD CONSTRAINT "computers_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id");--> statement-breakpoint
ALTER TABLE "computers" ADD CONSTRAINT "computers_ml9XhGwYtCtS_fkey" FOREIGN KEY ("space_id","created_by_account_id") REFERENCES "space_members"("space_id","account_id");--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_yYRNLMt1Sepk_fkey" FOREIGN KEY ("space_id","computer_id") REFERENCES "computers"("space_id","id");--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_kind_check", ADD CONSTRAINT "conversation_events_kind_check" CHECK ("kind" in ('message.created', 'run.state', 'reply.segment', 'computer.state'));--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_payload_check", ADD CONSTRAINT "conversation_events_payload_check" CHECK ((
      ("kind" = 'message.created' and "message_id" is not null and "run_id" is null and "segment_id" is null and "data" is null and "computer_id" is null) or
      ("kind" = 'run.state' and "message_id" is null and "run_id" is not null and "segment_id" is null and "data" is not null and "computer_id" is null) or
      ("kind" = 'reply.segment' and "message_id" is null and "run_id" is not null and "segment_id" is not null and "data" is null and "computer_id" is null) or
      ("kind" = 'computer.state' and "message_id" is null and "run_id" is null and "segment_id" is null and "computer_id" is not null and "data" is not null)
    ));