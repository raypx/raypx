CREATE TABLE "conversation_run_attempts" (
	"space_id" text,
	"conversation_id" text,
	"run_id" text,
	"id" text,
	"owner_id" text NOT NULL,
	"fence" bigint NOT NULL,
	"number" integer NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"failure_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"timeout_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "conversation_run_attempts_pkey" PRIMARY KEY("space_id","conversation_id","run_id","id"),
	CONSTRAINT "conversation_run_attempts_state_check" CHECK ("state" in ('running', 'succeeded', 'failed', 'cancelled', 'released', 'abandoned')),
	CONSTRAINT "conversation_run_attempts_bounds_check" CHECK ("fence" > 0 and "number" > 0 and "timeout_at" > "started_at")
);
--> statement-breakpoint
CREATE TABLE "conversation_run_backup_jobs" (
	"space_id" text,
	"conversation_id" text,
	"run_id" text,
	"run_at" timestamp with time zone NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"deliveries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_run_backup_jobs_pkey" PRIMARY KEY("space_id","conversation_id","run_id"),
	CONSTRAINT "conversation_run_backup_jobs_lock_check" CHECK (("locked_by" is null) = ("locked_until" is null))
);
--> statement-breakpoint
CREATE TABLE "conversation_run_checkpoints" (
	"space_id" text,
	"conversation_id" text,
	"run_id" text,
	"attempt_id" text NOT NULL,
	"fence" bigint NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"history" jsonb NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_run_checkpoints_pkey" PRIMARY KEY("space_id","conversation_id","run_id"),
	CONSTRAINT "conversation_run_checkpoints_data_check" CHECK (jsonb_typeof("history") = 'array' and jsonb_typeof("data") = 'object' and "fence" > 0 and "revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "conversation_run_steering" (
	"space_id" text,
	"conversation_id" text,
	"run_id" text,
	"message_id" text,
	"sequence" bigint NOT NULL,
	"consumed_fence" bigint,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_run_steering_pkey" PRIMARY KEY("space_id","conversation_id","run_id","message_id"),
	CONSTRAINT "conversation_run_steering_consumed_check" CHECK (("consumed_at" is null) = ("consumed_fence" is null))
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD COLUMN "fence" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_effects" ADD COLUMN "fence" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD COLUMN "fence" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_reply_segments" ADD COLUMN "fence" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "fence" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "connection_id" text;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "computer_id" text;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD COLUMN "computer_generation" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_run_attempts_fence_idx" ON "conversation_run_attempts" ("space_id","conversation_id","run_id","fence");--> statement-breakpoint
CREATE INDEX "conversation_run_backup_jobs_due_idx" ON "conversation_run_backup_jobs" ("run_at","locked_until");--> statement-breakpoint
CREATE INDEX "conversation_run_steering_pending_idx" ON "conversation_run_steering" ("space_id","conversation_id","run_id","sequence") WHERE "consumed_at" is null;--> statement-breakpoint
CREATE INDEX "conversation_runs_recovery_idx" ON "conversation_runs" ("next_attempt_at","lease_expires_at") WHERE "state" in ('queued', 'running', 'waiting');--> statement-breakpoint
ALTER TABLE "conversation_run_attempts" ADD CONSTRAINT "conversation_run_attempts_jv3604sfJU17_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_backup_jobs" ADD CONSTRAINT "conversation_run_backup_jobs_vDlN74yAIbD0_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_checkpoints" ADD CONSTRAINT "conversation_run_checkpoints_pIf0Ef9UKLYa_fkey" FOREIGN KEY ("space_id","conversation_id","run_id","attempt_id") REFERENCES "conversation_run_attempts"("space_id","conversation_id","run_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_steering" ADD CONSTRAINT "conversation_run_steering_wFY9fuToTyp6_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_steering" ADD CONSTRAINT "conversation_run_steering_OiZivdS9DQCg_fkey" FOREIGN KEY ("space_id","conversation_id","message_id","sequence") REFERENCES "conversation_messages"("space_id","conversation_id","id","sequence") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_yYRNLMt1Sepk_fkey", ADD CONSTRAINT "conversation_events_yYRNLMt1Sepk_fkey" FOREIGN KEY ("space_id","computer_id") REFERENCES "computers"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_lease_check" CHECK (("lease_owner" is null) = ("lease_expires_at" is null));--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_fence_check" CHECK ("fence" >= 0 and "attempt_count" >= 0);--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_computer_pin_check" CHECK (("computer_id" is null) = ("computer_generation" is null));