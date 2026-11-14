CREATE TABLE "conversation_member_names" (
	"space_id" text,
	"conversation_id" text,
	"account_id" text,
	"display_name" text NOT NULL,
	CONSTRAINT "conversation_member_names_pkey" PRIMARY KEY("space_id","conversation_id","account_id"),
	CONSTRAINT "conversation_member_names_bounds" CHECK (length("display_name") <= 200)
);
--> statement-breakpoint
ALTER TABLE "space_members" ADD COLUMN "removal_reason" text;--> statement-breakpoint
CREATE INDEX "approval_requests_resolved_idx" ON "approval_requests" ("space_id","conversation_id","resolved_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "state" <> 'pending';--> statement-breakpoint
CREATE INDEX "conversation_events_activity_idx" ON "conversation_events" ("space_id","conversation_id","sequence" DESC NULLS LAST,"created_at");--> statement-breakpoint
CREATE INDEX "conversation_runs_history_idx" ON "conversation_runs" ("space_id","conversation_id","message_sequence","id");--> statement-breakpoint
ALTER TABLE "conversation_member_names" ADD CONSTRAINT "conversation_member_names_vSrQvYeZQmNq_fkey" FOREIGN KEY ("space_id","conversation_id") REFERENCES "conversations"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_removal_reason_check" CHECK ("removal_reason" in ('removed', 'left'));