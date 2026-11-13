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
CREATE INDEX "agent_mcp_servers_owner_idx" ON "agent_mcp_servers" ("account_id","server_id");--> statement-breakpoint
CREATE INDEX "agent_member_skills_skill_idx" ON "agent_member_skills" ("skill_id","account_id");--> statement-breakpoint
CREATE INDEX "agent_space_skills_skill_idx" ON "agent_space_skills" ("space_id","skill_id");--> statement-breakpoint
CREATE INDEX "mcp_server_secrets_owner_idx" ON "mcp_server_secrets" ("account_id","server_id");--> statement-breakpoint
CREATE INDEX "mcp_server_spaces_member_idx" ON "mcp_server_spaces" ("space_id","account_id","server_id");--> statement-breakpoint
CREATE INDEX "mcp_servers_account_idx" ON "mcp_servers" ("account_id","created_at","id");--> statement-breakpoint
CREATE INDEX "member_skill_spaces_member_idx" ON "member_skill_spaces" ("space_id","account_id","skill_id");--> statement-breakpoint
CREATE INDEX "member_skills_account_idx" ON "member_skills" ("account_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_share_links_token_idx" ON "page_share_links" ("token_hash");--> statement-breakpoint
CREATE INDEX "page_share_links_page_idx" ON "page_share_links" ("space_id","page_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_versions_mutation_idx" ON "page_versions" ("space_id","mutation_key") WHERE "mutation_key" is not null;--> statement-breakpoint
CREATE INDEX "pages_list_idx" ON "pages" ("space_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "pages_agent_idx" ON "pages" ("space_id","agent_id");--> statement-breakpoint
CREATE INDEX "skill_mutations_skill_idx" ON "skill_mutations" ("space_id","skill_id");--> statement-breakpoint
CREATE INDEX "space_skills_order_idx" ON "space_skills" ("space_id","created_at","id");--> statement-breakpoint
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT "agent_mcp_servers_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT "agent_mcp_servers_thahJHcnJ8Yo_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT "agent_mcp_servers_x8tWvyqGIkIb_fkey" FOREIGN KEY ("server_id","account_id") REFERENCES "mcp_servers"("id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_member_skills" ADD CONSTRAINT "agent_member_skills_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_member_skills" ADD CONSTRAINT "agent_member_skills_aNRelqJpNjdm_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_member_skills" ADD CONSTRAINT "agent_member_skills_M48Z0rWngmj1_fkey" FOREIGN KEY ("skill_id","account_id") REFERENCES "member_skills"("id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_space_skills" ADD CONSTRAINT "agent_space_skills_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_space_skills" ADD CONSTRAINT "agent_space_skills_r44wC20r2c9K_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "agent_space_skills" ADD CONSTRAINT "agent_space_skills_E4CKQnTea6UZ_fkey" FOREIGN KEY ("space_id","skill_id") REFERENCES "space_skills"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mcp_server_secrets" ADD CONSTRAINT "mcp_server_secrets_DosQQutjQv11_fkey" FOREIGN KEY ("server_id","account_id","id") REFERENCES "mcp_servers"("id","account_id","secret_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mcp_server_spaces" ADD CONSTRAINT "mcp_server_spaces_GaEj2xTQgleA_fkey" FOREIGN KEY ("server_id","account_id") REFERENCES "mcp_servers"("id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mcp_server_spaces" ADD CONSTRAINT "mcp_server_spaces_CjkEgGFxh9uN_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member_skill_spaces" ADD CONSTRAINT "member_skill_spaces_m7Z9ySXspTWA_fkey" FOREIGN KEY ("skill_id","account_id") REFERENCES "member_skills"("id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member_skill_spaces" ADD CONSTRAINT "member_skill_spaces_KRHoTRKuWQQV_fkey" FOREIGN KEY ("space_id","account_id") REFERENCES "space_members"("space_id","account_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "member_skills" ADD CONSTRAINT "member_skills_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "page_share_links" ADD CONSTRAINT "page_share_links_space_id_page_id_pages_space_id_id_fkey" FOREIGN KEY ("space_id","page_id") REFERENCES "pages"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "page_share_links" ADD CONSTRAINT "page_share_links_cekgp5Csym7P_fkey" FOREIGN KEY ("space_id","page_id","version") REFERENCES "page_versions"("space_id","page_id","version") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_space_id_page_id_pages_space_id_id_fkey" FOREIGN KEY ("space_id","page_id") REFERENCES "pages"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "skill_mutations" ADD CONSTRAINT "skill_mutations_DEDrX1JqClcb_fkey" FOREIGN KEY ("space_id","conversation_id","run_id") REFERENCES "conversation_runs"("space_id","conversation_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "skill_mutations" ADD CONSTRAINT "skill_mutations_space_id_skill_id_space_skills_space_id_id_fkey" FOREIGN KEY ("space_id","skill_id") REFERENCES "space_skills"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_skills" ADD CONSTRAINT "space_skills_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_skills" ADD CONSTRAINT "space_skills_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval_requests" DROP CONSTRAINT "approval_requests_tool_check", ADD CONSTRAINT "approval_requests_tool_check" CHECK (("tool_name" in ('computer_list_files', 'computer_read_file', 'computer_write_file', 'computer_run_command', 'agent_memory_save', 'agent_memory_update', 'agent_page_create', 'agent_page_update', 'agent_page_read', 'agent_skill_load', 'agent_skill_save') or "tool_name" ~ '^mcp_[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$' and length("tool_name") <= 128));--> statement-breakpoint
ALTER TABLE "approval_rules" DROP CONSTRAINT "approval_rules_tool_check", ADD CONSTRAINT "approval_rules_tool_check" CHECK (("tool_name" in ('computer_list_files', 'computer_read_file', 'computer_write_file', 'computer_run_command', 'agent_memory_save', 'agent_memory_update', 'agent_page_create', 'agent_page_update', 'agent_page_read', 'agent_skill_load', 'agent_skill_save') or "tool_name" ~ '^mcp_[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$' and length("tool_name") <= 128));--> statement-breakpoint
ALTER TABLE "conversation_effects" DROP CONSTRAINT "conversation_effects_tool_check", ADD CONSTRAINT "conversation_effects_tool_check" CHECK (("tool_name" in ('computer_write_file', 'computer_run_command', 'agent_memory_save', 'agent_memory_update', 'agent_page_create', 'agent_page_update', 'agent_skill_save') or "tool_name" ~ '^mcp_[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+$' and length("tool_name") <= 128));--> statement-breakpoint
ALTER TABLE "space_events" DROP CONSTRAINT "space_events_kind_check", ADD CONSTRAINT "space_events_kind_check" CHECK ("kind" in ('space.member.joined', 'space.member.removed', 'space.member.role_changed', 'space.renamed', 'page.created', 'page.updated', 'page.deleted'));