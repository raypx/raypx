CREATE TABLE "account" (
	"id" text PRIMARY KEY,
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
CREATE TABLE "admin_audit" (
	"id" text PRIMARY KEY,
	"request_id" text NOT NULL,
	"actor_id" text,
	"source" text NOT NULL,
	"action" text NOT NULL,
	"target_id" text,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"before" jsonb,
	"after" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_mcp_servers" (
	"space_id" text,
	"agent_id" text,
	"account_id" text,
	"server_id" text,
	CONSTRAINT "agent_mcp_servers_pkey" PRIMARY KEY("space_id","agent_id","account_id","server_id")
);
--> statement-breakpoint
CREATE TABLE "agent_member_skills" (
	"space_id" text,
	"agent_id" text,
	"account_id" text,
	"skill_id" text,
	CONSTRAINT "agent_member_skills_pkey" PRIMARY KEY("space_id","agent_id","account_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "agent_space_skills" (
	"space_id" text,
	"agent_id" text,
	"account_id" text,
	"skill_id" text,
	CONSTRAINT "agent_space_skills_pkey" PRIMARY KEY("space_id","agent_id","account_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"space_id" text,
	"id" text,
	"name" text NOT NULL,
	"instructions" text NOT NULL,
	"model_id" text NOT NULL,
	"allow_shared_memory" boolean DEFAULT false NOT NULL,
	"allow_cross_space_messages" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_pkey" PRIMARY KEY("space_id","id")
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"space_id" text,
	"conversation_id" text,
	"id" text,
	"run_id" text NOT NULL,
	"fence" bigint DEFAULT 0 NOT NULL,
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
	CONSTRAINT "approval_requests_tool_check" CHECK (("tool_name" in ('computer_list_files', 'computer_read_file', 'computer_write_file', 'computer_run_command', 'agent_memory_save', 'agent_memory_update', 'agent_page_create', 'agent_page_update', 'agent_page_read', 'agent_skill_load', 'agent_skill_save') or ("tool_name" ~ '^mcp_[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$' or "tool_name" ~ '^openapi_[a-f0-9]{32}__[a-zA-Z0-9_-]{1,64}$') and length("tool_name") <= 128)),
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
	CONSTRAINT "approval_rules_tool_check" CHECK (("tool_name" in ('computer_list_files', 'computer_read_file', 'computer_write_file', 'computer_run_command', 'agent_memory_save', 'agent_memory_update', 'agent_page_create', 'agent_page_update', 'agent_page_read', 'agent_skill_load', 'agent_skill_save') or ("tool_name" ~ '^mcp_[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$' or "tool_name" ~ '^openapi_[a-f0-9]{32}__[a-zA-Z0-9_-]{1,64}$') and length("tool_name") <= 128)),
	CONSTRAINT "approval_rules_executable_check" CHECK (("tool_name" = 'computer_run_command' and "executable" is not null and length("executable") between 1 and 1024) or ("tool_name" <> 'computer_run_command' and "executable" is null))
);
--> statement-breakpoint
CREATE TABLE "approval_settings" (
	"account_id" text PRIMARY KEY,
	"mode" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_settings_mode_check" CHECK ("mode" in ('ask', 'never'))
);
--> statement-breakpoint
CREATE TABLE "cloud_job" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"cron" text NOT NULL,
	"timezone" text NOT NULL,
	"enabled" boolean NOT NULL,
	"action" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloud_job_run" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"job_revision" integer NOT NULL,
	"trigger" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"action" jsonb NOT NULL,
	"task_id" text,
	"code" text,
	"sync" jsonb
);
--> statement-breakpoint
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
CREATE TABLE "context_deletion" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"revision" integer NOT NULL,
	"deleted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_document" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"project" jsonb,
	"revision" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_version" (
	"document_id" text,
	"user_id" text NOT NULL,
	"revision" integer,
	"body" jsonb NOT NULL,
	CONSTRAINT "context_version_pkey" PRIMARY KEY("document_id","revision")
);
--> statement-breakpoint
CREATE TABLE "control_command" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_command_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "control_credential" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_credential_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "control_device" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_device_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "control_event" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_event_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "control_grant" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_grant_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "control_observed_request" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_observed_request_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "control_observed_session" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_observed_session_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "control_owner" (
	"security_epoch" integer DEFAULT 0 NOT NULL,
	"security_revoked_at" timestamp with time zone,
	"user_id" text PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE "control_project" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_project_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "control_request" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_request_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "control_task" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_task_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "conversation_counters" (
	"space_id" text,
	"conversation_id" text,
	"sequence" bigint DEFAULT 0 NOT NULL,
	"retained_after" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "conversation_counters_pkey" PRIMARY KEY("space_id","conversation_id"),
	CONSTRAINT "conversation_counters_bounds" CHECK ("retained_after" >= 0 and "retained_after" <= "sequence" and "sequence" <= 9007199254740991)
);
--> statement-breakpoint
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
CREATE TABLE "conversation_effects" (
	"space_id" text,
	"key" text,
	"conversation_id" text NOT NULL,
	"run_id" text NOT NULL,
	"fence" bigint DEFAULT 0 NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"argument_hash" text NOT NULL,
	"state" text DEFAULT 'intent' NOT NULL,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "conversation_effects_pkey" PRIMARY KEY("space_id","key"),
	CONSTRAINT "conversation_effects_tool_check" CHECK (("tool_name" in ('computer_write_file', 'computer_run_command', 'agent_memory_save', 'agent_memory_update', 'agent_page_create', 'agent_page_update', 'agent_skill_save') or ("tool_name" ~ '^mcp_[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$' or "tool_name" ~ '^openapi_[a-f0-9]{32}__[a-zA-Z0-9_-]{1,64}$') and length("tool_name") <= 128)),
	CONSTRAINT "conversation_effects_state_check" CHECK ("state" in ('intent', 'succeeded', 'failed', 'unknown')),
	CONSTRAINT "conversation_effects_key_check" CHECK ("key" ~ '^[a-f0-9]{64}$' and "argument_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "conversation_effects_outcome_check" CHECK (("state" in ('intent', 'unknown') and "result" is null and "completed_at" is null) or ("state" in ('succeeded', 'failed') and "result" is not null and length("result") <= 16384 and "completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "conversation_events" (
	"space_id" text,
	"conversation_id" text,
	"sequence" bigint,
	"kind" text NOT NULL,
	"message_id" text,
	"data" jsonb,
	"run_id" text,
	"fence" bigint DEFAULT 0 NOT NULL,
	"segment_id" text,
	"computer_id" text,
	"request_id" text,
	"page_id" text GENERATED ALWAYS AS (case when "conversation_events"."kind" = 'tool.finished' then "conversation_events"."data"->'page'->>'id' else null end) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_events_pkey" PRIMARY KEY("space_id","conversation_id","sequence"),
	CONSTRAINT "conversation_events_payload_check" CHECK ((
      ("kind" = 'message.created' and "message_id" is not null and "run_id" is null and "segment_id" is null and "data" is null and "computer_id" is null and "request_id" is null) or
      ("kind" = 'run.state' and "message_id" is null and "run_id" is not null and "segment_id" is null and "data" is not null and "computer_id" is null and "request_id" is null) or
      ("kind" = 'reply.segment' and "message_id" is null and "run_id" is not null and "segment_id" is not null and "data" is null and "computer_id" is null and "request_id" is null) or
      ("kind" = 'computer.state' and "message_id" is null and "run_id" is null and "segment_id" is null and "computer_id" is not null and "data" is not null and "request_id" is null) or
      ("kind" in ('tool.started', 'tool.finished') and "message_id" is null and "run_id" is not null and "segment_id" is null and "computer_id" is null and "request_id" is null and "data" is not null) or
      ("kind" in ('card.created', 'card.resolved') and "message_id" is null and "run_id" is not null and "segment_id" is null and "computer_id" is null and "request_id" is not null and "data" is not null)
    )),
	CONSTRAINT "conversation_events_kind_check" CHECK ("kind" in ('message.created', 'run.state', 'reply.segment', 'computer.state', 'card.created', 'card.resolved', 'tool.started', 'tool.finished'))
);
--> statement-breakpoint
CREATE TABLE "conversation_member_names" (
	"space_id" text,
	"conversation_id" text,
	"account_id" text,
	"display_name" text NOT NULL,
	CONSTRAINT "conversation_member_names_pkey" PRIMARY KEY("space_id","conversation_id","account_id"),
	CONSTRAINT "conversation_member_names_bounds" CHECK (length("display_name") <= 200)
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
CREATE TABLE "conversation_messages" (
	"space_id" text,
	"conversation_id" text,
	"id" text,
	"sequence" bigint NOT NULL,
	"author_account_id" text NOT NULL,
	"author_agent_id" text,
	"idempotency_key" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_messages_pkey" PRIMARY KEY("space_id","conversation_id","id"),
	CONSTRAINT "conversation_messages_sequence_check" CHECK ("sequence" > 0 and "sequence" <= 9007199254740991)
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
CREATE TABLE "conversation_reply_segments" (
	"space_id" text,
	"conversation_id" text,
	"id" text,
	"run_id" text NOT NULL,
	"fence" bigint DEFAULT 0 NOT NULL,
	"sequence" bigint NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_reply_segments_pkey" PRIMARY KEY("space_id","conversation_id","id")
);
--> statement-breakpoint
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
	CONSTRAINT "conversation_run_checkpoints_memory_refs_check" CHECK (not coalesce(("data"->'memory') ? 'revisions', false)),
	CONSTRAINT "conversation_run_checkpoints_data_check" CHECK (jsonb_typeof("history") = 'array' and jsonb_typeof("data") = 'object' and "fence" > 0 and "revision" >= 0)
);
--> statement-breakpoint
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
CREATE TABLE "conversation_runs" (
	"space_id" text,
	"conversation_id" text,
	"id" text,
	"agent_id" text NOT NULL,
	"trigger" text DEFAULT 'message' NOT NULL,
	"parent_run_id" text,
	"delegation_depth" integer DEFAULT 0 NOT NULL,
	"delegation_task" text,
	"delegated_allow_shared_memory" boolean,
	"instruction_revision" integer DEFAULT 0 NOT NULL,
	"computer_held" boolean DEFAULT false NOT NULL,
	"origin_message_id" text,
	"agent_chain_depth" integer DEFAULT 0 NOT NULL,
	"untrusted_input" boolean DEFAULT false NOT NULL,
	"routine_id" text,
	"routine_due_at" timestamp with time zone,
	"routine_timezone" text,
	"inbound_content" text,
	"inbound_provenance" jsonb,
	"inbound_routine_id" text GENERATED ALWAYS AS (inbound_provenance ->> 'routineId') STORED,
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
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"fence" bigint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"connection_id" text,
	"computer_id" text,
	"computer_generation" integer,
	CONSTRAINT "conversation_runs_pkey" PRIMARY KEY("space_id","conversation_id","id"),
	CONSTRAINT "conversation_runs_state_check" CHECK ("state" in ('queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "conversation_runs_trigger_check" CHECK ("trigger" in ('message', 'routine', 'webhook', 'email', 'agent')),
	CONSTRAINT "conversation_runs_lease_check" CHECK (("lease_owner" is null) = ("lease_expires_at" is null)),
	CONSTRAINT "conversation_runs_fence_check" CHECK ("fence" >= 0 and "attempt_count" >= 0),
	CONSTRAINT "conversation_runs_computer_pin_check" CHECK (("computer_id" is null) = ("computer_generation" is null)),
	CONSTRAINT "conversation_runs_inbound_routine_check" CHECK ("inbound_provenance" is null or ("inbound_routine_id" is not null and "routine_id" is not null and "inbound_routine_id" = "routine_id"))
);
--> statement-breakpoint
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
	"page_id" text,
	"page_version" integer,
	"fence" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "conversation_tool_calls_pkey" PRIMARY KEY("space_id","run_id","tool_call_id"),
	CONSTRAINT "conversation_tool_calls_page_check" CHECK (("page_id" is null and "page_version" is null) or ("page_id" is not null and "page_version" is not null and "page_version" > 0 and "finished_at" is not null and "outcome" = 'succeeded' and "tool_name" in ('agent_page_create', 'agent_page_update')))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"space_id" text,
	"id" text,
	"agent_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"default_responder_agent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "conversations_kind_check" CHECK ("kind" in ('direct', 'group')),
	CONSTRAINT "conversations_group_name_check" CHECK ("kind" <> 'group' or "name" is not null)
);
--> statement-breakpoint
CREATE TABLE "instance_enrollment" (
	"id" text PRIMARY KEY,
	"code_hash" text NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"body" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"alg" text,
	"crv" text
);
--> statement-breakpoint
CREATE TABLE "mail_configuration" (
	"id" text PRIMARY KEY,
	"sender" text NOT NULL,
	"default_locale" text NOT NULL,
	"enabled" boolean NOT NULL,
	"credentials" text NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_server_secrets" (
	"id" text PRIMARY KEY,
	"server_id" text NOT NULL,
	"account_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"wrapped_data_key" text NOT NULL,
	"key_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_server_spaces" (
	"server_id" text,
	"account_id" text NOT NULL,
	"space_id" text,
	CONSTRAINT "mcp_server_spaces_pkey" PRIMARY KEY("server_id","space_id")
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"availability" text NOT NULL,
	"secret_id" text NOT NULL,
	"has_credentials" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_servers_owner_idx" UNIQUE("id","account_id"),
	CONSTRAINT "mcp_servers_secret_owner_idx" UNIQUE("id","account_id","secret_id"),
	CONSTRAINT "mcp_servers_availability_check" CHECK ("availability" in ('all', 'selected'))
);
--> statement-breakpoint
CREATE TABLE "member_skill_spaces" (
	"skill_id" text,
	"account_id" text NOT NULL,
	"space_id" text,
	CONSTRAINT "member_skill_spaces_pkey" PRIMARY KEY("skill_id","space_id")
);
--> statement-breakpoint
CREATE TABLE "member_skills" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"body" text NOT NULL,
	"availability" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_skills_owner_idx" UNIQUE("id","account_id"),
	CONSTRAINT "member_skills_availability_check" CHECK ("availability" in ('all', 'selected')),
	CONSTRAINT "member_skills_size_check" CHECK (length("name") between 1 and 120 and length("description") between 1 and 500 and octet_length("body") <= 256000)
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
CREATE TABLE "oauth_access_token" (
	"id" text PRIMARY KEY,
	"token" text NOT NULL UNIQUE,
	"client_id" text NOT NULL,
	"session_id" text,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	"user_id" text,
	"refresh_id" text
);
--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY,
	"client_id" text NOT NULL UNIQUE,
	"client_secret" text,
	"client_discovery_id" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"client_credentials_scopes" text[] DEFAULT '{}'::text[],
	"user_id" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"backchannel_logout_uri" text,
	"backchannel_logout_session_required" boolean,
	"token_endpoint_auth_method" text,
	"application_type" text,
	"jwks" text,
	"jwks_uri" text,
	"grant_types" text[],
	"response_types" text[],
	"require_pkce" boolean,
	"dpop_bound_access_tokens" boolean DEFAULT false,
	"reference_id" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "oauth_client_assertion" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_resource" (
	"id" text PRIMARY KEY,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_token" (
	"id" text PRIMARY KEY,
	"token" text NOT NULL UNIQUE,
	"client_id" text NOT NULL,
	"session_id" text,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	"user_id" text NOT NULL,
	"rotated_at" timestamp with time zone,
	"rotation_replay_response" text,
	"rotation_replay_expires_at" timestamp with time zone,
	"auth_time" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_resource" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "openapi_server_agents" (
	"space_id" text,
	"server_id" text,
	"agent_id" text,
	CONSTRAINT "openapi_server_agents_pkey" PRIMARY KEY("space_id","server_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "openapi_server_secrets" (
	"space_id" text,
	"server_id" text,
	"id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"wrapped_data_key" text NOT NULL,
	"key_id" text NOT NULL,
	CONSTRAINT "openapi_server_secrets_pkey" PRIMARY KEY("space_id","server_id")
);
--> statement-breakpoint
CREATE TABLE "openapi_servers" (
	"space_id" text,
	"id" text,
	"credential_owner_id" text NOT NULL,
	"secret_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"operations" jsonb NOT NULL,
	"selected_operation_ids" jsonb NOT NULL,
	"availability" text NOT NULL,
	"has_credentials" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "openapi_servers_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "openapi_servers_secret_idx" UNIQUE("space_id","id","secret_id"),
	CONSTRAINT "openapi_servers_availability_check" CHECK ("availability" in ('all', 'selected'))
);
--> statement-breakpoint
CREATE TABLE "page_identities" (
	"space_id" text,
	"id" text,
	CONSTRAINT "page_identities_pkey" PRIMARY KEY("space_id","id")
);
--> statement-breakpoint
CREATE TABLE "page_share_links" (
	"space_id" text,
	"id" text,
	"page_id" text NOT NULL,
	"version" integer,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "page_share_links_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "page_share_links_hash_check" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "page_share_links_version_check" CHECK ("version" is null or "version" > 0)
);
--> statement-breakpoint
CREATE TABLE "page_versions" (
	"space_id" text,
	"page_id" text,
	"version" integer,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"author" jsonb NOT NULL,
	"reason" text NOT NULL,
	"mutation_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_versions_pkey" PRIMARY KEY("space_id","page_id","version"),
	CONSTRAINT "page_versions_version_check" CHECK ("version" > 0),
	CONSTRAINT "page_versions_kind_check" CHECK ("kind" in ('document', 'html')),
	CONSTRAINT "page_versions_reason_check" CHECK ("reason" in ('created', 'updated', 'renamed', 'restored')),
	CONSTRAINT "page_versions_size_check" CHECK (octet_length("body") <= 262144)
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"space_id" text,
	"id" text,
	"agent_id" text,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "pages_kind_check" CHECK ("kind" in ('document', 'html')),
	CONSTRAINT "pages_version_check" CHECK ("version" > 0),
	CONSTRAINT "pages_title_check" CHECK (length("title") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL UNIQUE,
	"counter" bigint NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
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
CREATE TABLE "runtime_instance" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"body" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_attachment" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"ready" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_mutations" (
	"space_id" text,
	"conversation_id" text NOT NULL,
	"run_id" text,
	"tool_call_id" text,
	"skill_id" text NOT NULL,
	"digest" text NOT NULL,
	"fence" integer NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "skill_mutations_pkey" PRIMARY KEY("space_id","run_id","tool_call_id")
);
--> statement-breakpoint
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
	"subject_account_id" text GENERATED ALWAYS AS (payload ->> 'accountId') STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_events_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "space_events_kind_check" CHECK ("kind" in ('space.member.joined', 'space.member.removed', 'space.member.role_changed', 'space.renamed', 'page.created', 'page.updated', 'page.deleted'))
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
CREATE TABLE "space_members" (
	"space_id" text,
	"account_id" text,
	"role" text NOT NULL,
	"removed_at" timestamp with time zone,
	"removal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_members_pkey" PRIMARY KEY("space_id","account_id"),
	CONSTRAINT "space_members_role_check" CHECK ("role" in ('owner', 'member')),
	CONSTRAINT "space_members_removal_reason_check" CHECK ("removal_reason" in ('removed', 'left'))
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
CREATE TABLE "space_settings_overrides" (
	"space_id" text PRIMARY KEY,
	"approval_mode" text NOT NULL,
	"updated_by_account_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_settings_overrides_mode_check" CHECK ("approval_mode" in ('ask', 'never'))
);
--> statement-breakpoint
CREATE TABLE "space_skills" (
	"space_id" text,
	"id" text,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_skills_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "space_skills_size_check" CHECK (length("name") between 1 and 120 and length("description") between 1 and 500 and octet_length("body") <= 256000)
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"private_for" text UNIQUE,
	"deletion_claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_configuration" (
	"id" text PRIMARY KEY,
	"endpoint" text NOT NULL,
	"region" text NOT NULL,
	"bucket" text NOT NULL,
	"credentials" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_configuration" (
	"id" text PRIMARY KEY,
	"site_name" text NOT NULL,
	"registration_enabled" boolean NOT NULL,
	"cleanup_enabled" boolean NOT NULL,
	"revision" integer NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'member' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_idx" ON "account" ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "admin_audit_time_idx" ON "admin_audit" ("started_at","id");--> statement-breakpoint
CREATE INDEX "admin_audit_actor_time_idx" ON "admin_audit" ("actor_id","started_at","id");--> statement-breakpoint
CREATE INDEX "admin_audit_target_time_idx" ON "admin_audit" ("target_id","started_at","id");--> statement-breakpoint
CREATE INDEX "agent_mcp_servers_owner_idx" ON "agent_mcp_servers" ("account_id","server_id");--> statement-breakpoint
CREATE INDEX "agent_member_skills_skill_idx" ON "agent_member_skills" ("skill_id","account_id");--> statement-breakpoint
CREATE INDEX "agent_space_skills_skill_idx" ON "agent_space_skills" ("space_id","skill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_id_idx" ON "approval_requests" ("space_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_event_ref_idx" ON "approval_requests" ("space_id","conversation_id","run_id","id");--> statement-breakpoint
CREATE INDEX "approval_requests_call_idx" ON "approval_requests" ("space_id","conversation_id","run_id","tool_call_id");--> statement-breakpoint
CREATE INDEX "approval_requests_resolved_idx" ON "approval_requests" ("space_id","conversation_id","resolved_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "state" <> 'pending';--> statement-breakpoint
CREATE INDEX "approval_requests_pending_idx" ON "approval_requests" ("space_id","member_account_id","created_at") WHERE "state" = 'pending';--> statement-breakpoint
CREATE INDEX "cloud_job_owner_idx" ON "cloud_job" ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "cloud_job_due_idx" ON "cloud_job" ("next_run_at","id") WHERE "enabled"=true;--> statement-breakpoint
CREATE UNIQUE INDEX "cloud_job_run_schedule_idx" ON "cloud_job_run" ("job_id","scheduled_for") WHERE "trigger"='schedule';--> statement-breakpoint
CREATE INDEX "cloud_job_run_history_idx" ON "cloud_job_run" ("user_id","job_id","started_at","id");--> statement-breakpoint
CREATE INDEX "cloud_job_run_active_idx" ON "cloud_job_run" ("checked_at","id") WHERE "status" in ('dispatching','running','waiting','unknown');--> statement-breakpoint
CREATE UNIQUE INDEX "computers_team_idx" ON "computers" ("space_id") WHERE "scope" = 'team';--> statement-breakpoint
CREATE UNIQUE INDEX "computers_private_agent_idx" ON "computers" ("space_id","agent_id") WHERE "scope" = 'private';--> statement-breakpoint
CREATE INDEX "computers_creator_idx" ON "computers" ("created_by_account_id");--> statement-breakpoint
CREATE INDEX "context_deletion_owner_idx" ON "context_deletion" ("user_id");--> statement-breakpoint
CREATE INDEX "context_document_owner_idx" ON "context_document" ("user_id","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "context_document_canonical_id_idx" ON "context_document" (lower("id"));--> statement-breakpoint
CREATE INDEX "context_version_owner_idx" ON "context_version" ("user_id","document_id","revision");--> statement-breakpoint
CREATE INDEX "control_command_device_idx" ON "control_command" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_command_context_owner_idx" ON "control_command" ("user_id",coalesce("body"->>'capturedAt',"body"->'context'->>'capturedAt',''),"id") WHERE jsonb_typeof("body"->'context')='object';--> statement-breakpoint
CREATE INDEX "control_command_context_expiry_idx" ON "control_command" (coalesce("body"->>'capturedAt',"body"->'context'->>'capturedAt',''),"user_id","id") WHERE jsonb_typeof("body"->'context')='object';--> statement-breakpoint
CREATE INDEX "control_credential_device_idx" ON "control_credential" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_credential_hash_idx" ON "control_credential" ("id");--> statement-breakpoint
CREATE INDEX "control_device_device_idx" ON "control_device" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_event_device_idx" ON "control_event" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_event_activity_idx" ON "control_event" ("user_id",("body"->>'taskId'),(("body"->'event'->'entry'->>'order')::bigint)) WHERE "body"->'event'->>'kind' = 'activity';--> statement-breakpoint
CREATE INDEX "control_event_task_cursor_idx" ON "control_event" ("user_id",("body"->>'taskId'),(("body"->>'cursor')::bigint)) WHERE "body"->'event'->>'kind' != 'activity';--> statement-breakpoint
CREATE INDEX "control_event_replay_idx" ON "control_event" ("user_id","device_id",(("body"->>'cursor')::bigint)) WHERE "body"->'event'->>'kind' != 'activity';--> statement-breakpoint
CREATE INDEX "control_event_stream_idx" ON "control_event" ("user_id","device_id",("body"->>'streamId'),(("body"->>'cursor')::bigint));--> statement-breakpoint
CREATE INDEX "control_grant_device_idx" ON "control_grant" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_observed_request_device_idx" ON "control_observed_request" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_observed_session_device_idx" ON "control_observed_session" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_project_device_idx" ON "control_project" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_request_device_idx" ON "control_request" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_request_task_idx" ON "control_request" ("user_id",("body"->>'taskId'));--> statement-breakpoint
CREATE INDEX "control_task_device_idx" ON "control_task" ("user_id","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_delegations_child_idx" ON "conversation_delegations" ("space_id","conversation_id","child_run_id");--> statement-breakpoint
CREATE INDEX "conversation_effects_run_idx" ON "conversation_effects" ("space_id","conversation_id","run_id");--> statement-breakpoint
CREATE INDEX "conversation_events_activity_idx" ON "conversation_events" ("space_id","conversation_id","sequence" DESC NULLS LAST,"created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_sequence_idx" ON "conversation_messages" ("space_id","conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_event_ref_idx" ON "conversation_messages" ("space_id","conversation_id","id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_idempotency_idx" ON "conversation_messages" ("space_id","conversation_id","author_account_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "conversation_participants_agent_idx" ON "conversation_participants" ("space_id","agent_id");--> statement-breakpoint
CREATE INDEX "conversation_reply_segments_run_idx" ON "conversation_reply_segments" ("space_id","conversation_id","run_id","sequence" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_reply_segments_sequence_idx" ON "conversation_reply_segments" ("space_id","conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_run_attempts_fence_idx" ON "conversation_run_attempts" ("space_id","conversation_id","run_id","fence");--> statement-breakpoint
CREATE INDEX "conversation_run_backup_jobs_due_idx" ON "conversation_run_backup_jobs" ("run_at","locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_run_memory_pins_position_idx" ON "conversation_run_memory_pins" ("space_id","conversation_id","run_id","position");--> statement-breakpoint
CREATE INDEX "conversation_run_memory_pins_source_idx" ON "conversation_run_memory_pins" ("space_id","document_id","revision");--> statement-breakpoint
CREATE INDEX "conversation_run_steering_pending_idx" ON "conversation_run_steering" ("space_id","conversation_id","run_id","sequence") WHERE "consumed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_runs_message_idx" ON "conversation_runs" ("space_id","conversation_id","message_id","agent_id") WHERE "parent_run_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_runs_actor_idx" ON "conversation_runs" ("space_id","conversation_id","id","member_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_runs_active_agent_idx" ON "conversation_runs" ("space_id","agent_id") WHERE "state" in ('running', 'waiting') and "parent_run_id" is null;--> statement-breakpoint
CREATE INDEX "conversation_runs_active_window_idx" ON "conversation_runs" ("space_id","conversation_id","message_sequence","id") WHERE "state" in ('queued', 'running', 'waiting');--> statement-breakpoint
CREATE INDEX "conversation_runs_routine_idx" ON "conversation_runs" ("space_id","routine_id");--> statement-breakpoint
CREATE INDEX "conversation_runs_inbound_routine_idx" ON "conversation_runs" ("space_id","inbound_routine_id");--> statement-breakpoint
CREATE INDEX "conversation_runs_queue_idx" ON "conversation_runs" ("space_id","conversation_id","state","message_sequence");--> statement-breakpoint
CREATE INDEX "conversation_runs_history_idx" ON "conversation_runs" ("space_id","conversation_id","message_sequence","id");--> statement-breakpoint
CREATE INDEX "conversation_runs_recovery_idx" ON "conversation_runs" ("next_attempt_at","lease_expires_at") WHERE "state" in ('queued', 'running', 'waiting');--> statement-breakpoint
CREATE INDEX "conversation_tool_calls_snapshot_idx" ON "conversation_tool_calls" ("space_id","conversation_id","started_at","run_id","tool_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_direct_agent_idx" ON "conversations" ("space_id","agent_id") WHERE "kind" = 'direct';--> statement-breakpoint
CREATE INDEX "instance_enrollment_expiry_idx" ON "instance_enrollment" ("expires_at");--> statement-breakpoint
CREATE INDEX "mcp_server_secrets_owner_idx" ON "mcp_server_secrets" ("account_id","server_id");--> statement-breakpoint
CREATE INDEX "mcp_server_spaces_member_idx" ON "mcp_server_spaces" ("space_id","account_id","server_id");--> statement-breakpoint
CREATE INDEX "mcp_servers_account_idx" ON "mcp_servers" ("account_id","created_at","id");--> statement-breakpoint
CREATE INDEX "member_skill_spaces_member_idx" ON "member_skill_spaces" ("space_id","account_id","skill_id");--> statement-breakpoint
CREATE INDEX "member_skills_account_idx" ON "member_skills" ("account_id","created_at","id");--> statement-breakpoint
CREATE INDEX "model_connection_secrets_owner_idx" ON "model_connection_secrets" ("account_id","connection_id");--> statement-breakpoint
CREATE INDEX "model_connection_spaces_member_idx" ON "model_connection_spaces" ("space_id","account_id","connection_id");--> statement-breakpoint
CREATE INDEX "model_connections_account_idx" ON "model_connections" ("account_id","created_at","id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_client_idx" ON "oauth_access_token" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_session_idx" ON "oauth_access_token" ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_user_idx" ON "oauth_access_token" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_code_idx" ON "oauth_access_token" ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_refresh_idx" ON "oauth_access_token" ("refresh_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_expiry_idx" ON "oauth_access_token" ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_client_user_idx" ON "oauth_client" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_client_resource_pair_idx" ON "oauth_client_resource" ("client_id","resource_id");--> statement-breakpoint
CREATE INDEX "oauth_client_resource_resource_idx" ON "oauth_client_resource" ("resource_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_client_user_idx" ON "oauth_consent" ("client_id","user_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_user_idx" ON "oauth_consent" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_client_idx" ON "oauth_refresh_token" ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_session_idx" ON "oauth_refresh_token" ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_user_idx" ON "oauth_refresh_token" ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_code_idx" ON "oauth_refresh_token" ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "openapi_server_agents_agent_idx" ON "openapi_server_agents" ("space_id","agent_id","server_id");--> statement-breakpoint
CREATE INDEX "openapi_servers_space_idx" ON "openapi_servers" ("space_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_share_links_token_idx" ON "page_share_links" ("token_hash");--> statement-breakpoint
CREATE INDEX "page_share_links_page_idx" ON "page_share_links" ("space_id","page_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_versions_mutation_idx" ON "page_versions" ("space_id","mutation_key") WHERE "mutation_key" is not null;--> statement-breakpoint
CREATE INDEX "pages_list_idx" ON "pages" ("space_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "pages_agent_idx" ON "pages" ("space_id","agent_id");--> statement-breakpoint
CREATE INDEX "passkey_user_idx" ON "passkey" ("user_id");--> statement-breakpoint
CREATE INDEX "rate_limit_last_request_idx" ON "rate_limit" ("last_request");--> statement-breakpoint
CREATE INDEX "routine_events_run_idx" ON "routine_events" ("space_id","conversation_id","run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_occurrences_event_ref_idx" ON "routine_occurrences" ("space_id","routine_id","id","conversation_id","run_id");--> statement-breakpoint
CREATE INDEX "routine_occurrences_history_idx" ON "routine_occurrences" ("space_id","routine_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "routines_ingress_id_idx" ON "routines" ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "routines_email_idx" ON "routines" ("email_address");--> statement-breakpoint
CREATE INDEX "routines_due_idx" ON "routines" ("enabled","next_due_at","id");--> statement-breakpoint
CREATE INDEX "routines_agent_idx" ON "routines" ("space_id","agent_id","created_at","id");--> statement-breakpoint
CREATE INDEX "runtime_instance_owner_idx" ON "runtime_instance" ("user_id","id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "session" ("expires_at");--> statement-breakpoint
CREATE INDEX "session_attachment_owner_idx" ON "session_attachment" ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "session_attachment_expiry_idx" ON "session_attachment" ("expires_at");--> statement-breakpoint
CREATE INDEX "skill_mutations_skill_idx" ON "skill_mutations" ("space_id","skill_id");--> statement-breakpoint
CREATE INDEX "space_audit_cursor_idx" ON "space_audit" ("space_id","created_at","id");--> statement-breakpoint
CREATE INDEX "space_audit_operation_idx" ON "space_audit" ("space_id","operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_invitations_token_hash_idx" ON "space_invitations" ("token_hash");--> statement-breakpoint
CREATE INDEX "space_invitations_open_idx" ON "space_invitations" ("space_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "space_members_account_idx" ON "space_members" ("account_id","space_id");--> statement-breakpoint
CREATE INDEX "space_memory_recall_idx" ON "space_memory_documents" ("space_id","agent_id","pinned","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_memory_mutation_idx" ON "space_memory_revisions" ("space_id","mutation_key") WHERE "mutation_key" is not null;--> statement-breakpoint
CREATE INDEX "space_skills_order_idx" ON "space_skills" ("space_id","created_at","id");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" ("secret");--> statement-breakpoint
CREATE INDEX "user_created_at_idx" ON "user" ("created_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "verification" ("expires_at");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT "agent_mcp_servers_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT "agent_mcp_servers_thahJHcnJ8Yo_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT "agent_mcp_servers_x8tWvyqGIkIb_fkey" FOREIGN KEY ("server_id","account_id") REFERENCES "mcp_servers"("id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_member_skills" ADD CONSTRAINT "agent_member_skills_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_member_skills" ADD CONSTRAINT "agent_member_skills_aNRelqJpNjdm_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_member_skills" ADD CONSTRAINT "agent_member_skills_M48Z0rWngmj1_fkey" FOREIGN KEY ("skill_id","account_id") REFERENCES "member_skills"("id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_space_skills" ADD CONSTRAINT "agent_space_skills_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_space_skills" ADD CONSTRAINT "agent_space_skills_r44wC20r2c9K_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_space_skills" ADD CONSTRAINT "agent_space_skills_E4CKQnTea6UZ_fkey" FOREIGN KEY ("space_id","skill_id") REFERENCES "space_skills"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_92Eb3hdX1SFr_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_NyTlPyvU1bAr_fkey" FOREIGN KEY ("space_id","conversation_id","run_id","member_account_id") REFERENCES "conversation_runs"("space_id","conversation_id","id","member_account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_MO9IML6PoB8W_fkey" FOREIGN KEY ("space_id","conversation_id","run_id","answered_by_account_id") REFERENCES "conversation_runs"("space_id","conversation_id","id","member_account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_settings" ADD CONSTRAINT "approval_settings_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cloud_job" ADD CONSTRAINT "cloud_job_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cloud_job_run" ADD CONSTRAINT "cloud_job_run_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cloud_job_run" ADD CONSTRAINT "cloud_job_run_job_id_cloud_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "cloud_job"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "computers" ADD CONSTRAINT "computers_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "computers" ADD CONSTRAINT "computers_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "computers" ADD CONSTRAINT "computers_ml9XhGwYtCtS_fkey" FOREIGN KEY ("space_id","created_by_account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "context_deletion" ADD CONSTRAINT "context_deletion_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "context_document" ADD CONSTRAINT "context_document_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "context_version" ADD CONSTRAINT "context_version_document_id_context_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "context_document"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "context_version" ADD CONSTRAINT "context_version_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "control_command" ADD CONSTRAINT "control_command_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "control_credential" ADD CONSTRAINT "control_credential_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "control_device" ADD CONSTRAINT "control_device_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "control_event" ADD CONSTRAINT "control_event_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "control_grant" ADD CONSTRAINT "control_grant_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "control_observed_request" ADD CONSTRAINT "control_observed_request_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "control_observed_session" ADD CONSTRAINT "control_observed_session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "control_owner" ADD CONSTRAINT "control_owner_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "control_project" ADD CONSTRAINT "control_project_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "control_request" ADD CONSTRAINT "control_request_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "control_task" ADD CONSTRAINT "control_task_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_counters" ADD CONSTRAINT "conversation_counters_VRyqPxfEewzC_fkey" FOREIGN KEY ("space_id","conversation_id") REFERENCES "conversations"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_delegations" ADD CONSTRAINT "conversation_delegations_6AKQohdM5emf_fkey" FOREIGN KEY ("space_id","conversation_id","parent_run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_delegations" ADD CONSTRAINT "conversation_delegations_xfb5rSMKKnZj_fkey" FOREIGN KEY ("space_id","conversation_id","child_run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_effects" ADD CONSTRAINT "conversation_effects_J2IU0GLCoiuz_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_kN24Tt1VblKw_fkey" FOREIGN KEY ("space_id","page_id") REFERENCES "page_identities"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_xpK9yYjL1Xi2_fkey" FOREIGN KEY ("space_id","conversation_id") REFERENCES "conversations"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_j0xCIsEXuSsQ_fkey" FOREIGN KEY ("space_id","conversation_id","message_id","sequence") REFERENCES "conversation_messages"("space_id","conversation_id","id","sequence") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_QDw4cP3SFQQc_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_jYPcAyFq6yhV_fkey" FOREIGN KEY ("space_id","conversation_id","segment_id") REFERENCES "conversation_reply_segments"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_yYRNLMt1Sepk_fkey" FOREIGN KEY ("space_id","computer_id") REFERENCES "computers"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_fYBbkMzqoYc2_fkey" FOREIGN KEY ("space_id","conversation_id","run_id","request_id") REFERENCES "approval_requests"("space_id","conversation_id","run_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_member_names" ADD CONSTRAINT "conversation_member_names_vSrQvYeZQmNq_fkey" FOREIGN KEY ("space_id","conversation_id") REFERENCES "conversations"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_message_mentions" ADD CONSTRAINT "conversation_message_mentions_TIJFbbjtIJ28_fkey" FOREIGN KEY ("space_id","conversation_id","message_id") REFERENCES "conversation_messages"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_message_mentions" ADD CONSTRAINT "conversation_message_mentions_VUv39vDI5gAu_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_SMMf0biS354z_fkey" FOREIGN KEY ("space_id","author_agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_bn1MB1734ixn_fkey" FOREIGN KEY ("space_id","conversation_id") REFERENCES "conversations"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_48Acu1RKMzwv_fkey" FOREIGN KEY ("space_id","conversation_id") REFERENCES "conversations"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_zPRh8oUzGEEH_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_reply_segments" ADD CONSTRAINT "conversation_reply_segments_H7AN6GazxOJO_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_attempts" ADD CONSTRAINT "conversation_run_attempts_jv3604sfJU17_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_backup_jobs" ADD CONSTRAINT "conversation_run_backup_jobs_vDlN74yAIbD0_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_checkpoints" ADD CONSTRAINT "conversation_run_checkpoints_pIf0Ef9UKLYa_fkey" FOREIGN KEY ("space_id","conversation_id","run_id","attempt_id") REFERENCES "conversation_run_attempts"("space_id","conversation_id","run_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_memory_pins" ADD CONSTRAINT "conversation_run_memory_pins_RNdJnDBf7vR2_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_run_checkpoints"("space_id","conversation_id","run_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_memory_pins" ADD CONSTRAINT "conversation_run_memory_pins_tzicmTIle9Ck_fkey" FOREIGN KEY ("space_id","document_id","revision") REFERENCES "space_memory_revisions"("space_id","document_id","revision") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_steering" ADD CONSTRAINT "conversation_run_steering_wFY9fuToTyp6_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_run_steering" ADD CONSTRAINT "conversation_run_steering_OiZivdS9DQCg_fkey" FOREIGN KEY ("space_id","conversation_id","message_id","sequence") REFERENCES "conversation_messages"("space_id","conversation_id","id","sequence") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_lOBaM63mQaD6_fkey" FOREIGN KEY ("space_id","conversation_id","parent_run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_cM5uW33VZfCG_fkey" FOREIGN KEY ("space_id","conversation_id","origin_message_id") REFERENCES "conversation_messages"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_jdFotloXl8JH_fkey" FOREIGN KEY ("space_id","routine_id") REFERENCES "routine_identities"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_3dHr38gNXeJx_fkey" FOREIGN KEY ("space_id","inbound_routine_id") REFERENCES "routine_identities"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_runs" ADD CONSTRAINT "conversation_runs_NWMFOmdgHUcX_fkey" FOREIGN KEY ("space_id","conversation_id","message_id","message_sequence") REFERENCES "conversation_messages"("space_id","conversation_id","id","sequence") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_tool_calls" ADD CONSTRAINT "conversation_tool_calls_kcbDZNOTMU95_fkey" FOREIGN KEY ("space_id","page_id") REFERENCES "page_identities"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_tool_calls" ADD CONSTRAINT "conversation_tool_calls_Lr03ldh2liAD_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_0uFXgR6BC06S_fkey" FOREIGN KEY ("space_id","default_responder_agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mcp_server_secrets" ADD CONSTRAINT "mcp_server_secrets_DosQQutjQv11_fkey" FOREIGN KEY ("server_id","account_id","id") REFERENCES "mcp_servers"("id","account_id","secret_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mcp_server_spaces" ADD CONSTRAINT "mcp_server_spaces_GaEj2xTQgleA_fkey" FOREIGN KEY ("server_id","account_id") REFERENCES "mcp_servers"("id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mcp_server_spaces" ADD CONSTRAINT "mcp_server_spaces_CjkEgGFxh9uN_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member_skill_spaces" ADD CONSTRAINT "member_skill_spaces_m7Z9ySXspTWA_fkey" FOREIGN KEY ("skill_id","account_id") REFERENCES "member_skills"("id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member_skill_spaces" ADD CONSTRAINT "member_skill_spaces_KRHoTRKuWQQV_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member_skills" ADD CONSTRAINT "member_skills_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "model_connection_secrets" ADD CONSTRAINT "model_connection_secrets_zwLfvrb9T99G_fkey" FOREIGN KEY ("connection_id","account_id","id") REFERENCES "model_connections"("id","account_id","secret_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "model_connection_spaces" ADD CONSTRAINT "model_connection_spaces_jXKIgGxj90Yh_fkey" FOREIGN KEY ("connection_id","account_id") REFERENCES "model_connections"("id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "model_connection_spaces" ADD CONSTRAINT "model_connection_spaces_zvgSVo4ZE3Bl_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "model_connections" ADD CONSTRAINT "model_connections_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_client_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_client"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_session_id_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_refresh_id_oauth_refresh_token_id_fkey" FOREIGN KEY ("refresh_id") REFERENCES "oauth_refresh_token"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_client_id_oauth_client_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_client"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_dn2L1gs9Dolm_fkey" FOREIGN KEY ("resource_id") REFERENCES "oauth_resource"("identifier") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_client_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_client"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_client_id_oauth_client_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oauth_client"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_session_id_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "openapi_server_agents" ADD CONSTRAINT "openapi_server_agents_jUVusABQYTPv_fkey" FOREIGN KEY ("space_id","server_id") REFERENCES "openapi_servers"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "openapi_server_agents" ADD CONSTRAINT "openapi_server_agents_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "openapi_server_secrets" ADD CONSTRAINT "openapi_server_secrets_OYYaba9M8tQZ_fkey" FOREIGN KEY ("space_id","server_id","id") REFERENCES "openapi_servers"("space_id","id","secret_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "openapi_servers" ADD CONSTRAINT "openapi_servers_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "page_identities" ADD CONSTRAINT "page_identities_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "page_share_links" ADD CONSTRAINT "page_share_links_space_id_page_id_pages_space_id_id_fkey" FOREIGN KEY ("space_id","page_id") REFERENCES "pages"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "page_share_links" ADD CONSTRAINT "page_share_links_cekgp5Csym7P_fkey" FOREIGN KEY ("space_id","page_id","version") REFERENCES "page_versions"("space_id","page_id","version") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_space_id_page_id_pages_space_id_id_fkey" FOREIGN KEY ("space_id","page_id") REFERENCES "pages"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_id_id_page_identities_space_id_id_fkey" FOREIGN KEY ("space_id","id") REFERENCES "page_identities"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
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
ALTER TABLE "runtime_instance" ADD CONSTRAINT "runtime_instance_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session_attachment" ADD CONSTRAINT "session_attachment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "skill_mutations" ADD CONSTRAINT "skill_mutations_DEDrX1JqClcb_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "skill_mutations" ADD CONSTRAINT "skill_mutations_space_id_skill_id_space_skills_space_id_id_fkey" FOREIGN KEY ("space_id","skill_id") REFERENCES "space_skills"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_audit" ADD CONSTRAINT "space_audit_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_deletion_jobs" ADD CONSTRAINT "space_deletion_jobs_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_events" ADD CONSTRAINT "space_events_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_events" ADD CONSTRAINT "space_events_LQC7N4uUAlF6_fkey" FOREIGN KEY ("space_id","subject_account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_invitations" ADD CONSTRAINT "space_invitations_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_invitations" ADD CONSTRAINT "space_invitations_ldatC0tErQvS_fkey" FOREIGN KEY ("space_id","inviter_account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_invitations" ADD CONSTRAINT "space_invitations_orPQyO8xb1wP_fkey" FOREIGN KEY ("space_id","consumed_by_account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_memory_documents" ADD CONSTRAINT "space_memory_documents_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_memory_documents" ADD CONSTRAINT "space_memory_documents_author_account_id_user_id_fkey" FOREIGN KEY ("author_account_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "space_memory_documents" ADD CONSTRAINT "space_memory_documents_8g0Pvw6psJ4k_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_memory_revisions" ADD CONSTRAINT "space_memory_revisions_9dTkS43ipnir_fkey" FOREIGN KEY ("space_id","document_id") REFERENCES "space_memory_documents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_settings_overrides" ADD CONSTRAINT "space_settings_overrides_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_skills" ADD CONSTRAINT "space_skills_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_skills" ADD CONSTRAINT "space_skills_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_private_for_user_id_fkey" FOREIGN KEY ("private_for") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "system_configuration" ADD CONSTRAINT "system_configuration_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;