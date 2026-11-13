CREATE TABLE "conversation_counters" (
	"space_id" text,
	"conversation_id" text,
	"sequence" bigint DEFAULT 0 NOT NULL,
	"retained_after" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "conversation_counters_pkey" PRIMARY KEY("space_id","conversation_id"),
	CONSTRAINT "conversation_counters_bounds" CHECK ("retained_after" >= 0 and "retained_after" <= "sequence" and "sequence" <= 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "conversation_events" (
	"space_id" text,
	"conversation_id" text,
	"sequence" bigint,
	"kind" text NOT NULL,
	"message_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_events_pkey" PRIMARY KEY("space_id","conversation_id","sequence"),
	CONSTRAINT "conversation_events_kind_check" CHECK ("kind" = 'message.created')
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"space_id" text,
	"conversation_id" text,
	"id" text,
	"sequence" bigint NOT NULL,
	"author_account_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_messages_pkey" PRIMARY KEY("space_id","conversation_id","id"),
	CONSTRAINT "conversation_messages_sequence_check" CHECK ("sequence" > 0 and "sequence" <= 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_sequence_idx" ON "conversation_messages" ("space_id","conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_event_ref_idx" ON "conversation_messages" ("space_id","conversation_id","id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_idempotency_idx" ON "conversation_messages" ("space_id","conversation_id","author_account_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "conversation_counters" ADD CONSTRAINT "conversation_counters_VRyqPxfEewzC_fkey" FOREIGN KEY ("space_id","conversation_id") REFERENCES "conversations"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_xpK9yYjL1Xi2_fkey" FOREIGN KEY ("space_id","conversation_id") REFERENCES "conversations"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_j0xCIsEXuSsQ_fkey" FOREIGN KEY ("space_id","conversation_id","message_id","sequence") REFERENCES "conversation_messages"("space_id","conversation_id","id","sequence") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_author_account_id_user_id_fkey" FOREIGN KEY ("author_account_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_bn1MB1734ixn_fkey" FOREIGN KEY ("space_id","conversation_id") REFERENCES "conversations"("space_id","id") ON DELETE CASCADE;