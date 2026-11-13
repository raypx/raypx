CREATE TABLE "agents" (
	"space_id" text,
	"id" text,
	"name" text NOT NULL,
	"instructions" text NOT NULL,
	"model_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_pkey" PRIMARY KEY("space_id","id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"space_id" text,
	"id" text,
	"agent_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_pkey" PRIMARY KEY("space_id","id"),
	CONSTRAINT "conversations_kind_check" CHECK ("kind" = 'direct')
);
--> statement-breakpoint
CREATE TABLE "space_members" (
	"space_id" text,
	"account_id" text,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_members_pkey" PRIMARY KEY("space_id","account_id"),
	CONSTRAINT "space_members_role_check" CHECK ("role" in ('owner', 'member'))
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"private_for" text UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_direct_agent_idx" ON "conversations" ("space_id","agent_id");--> statement-breakpoint
CREATE INDEX "space_members_account_idx" ON "space_members" ("account_id","space_id");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_space_id_agent_id_agents_space_id_id_fkey" FOREIGN KEY ("space_id","agent_id") REFERENCES "agents"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_account_id_user_id_fkey" FOREIGN KEY ("account_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_private_for_user_id_fkey" FOREIGN KEY ("private_for") REFERENCES "user"("id") ON DELETE CASCADE;