CREATE TABLE "pi_session_events" (
	"id" text PRIMARY KEY,
	"session_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pi_session_events_session_created_idx" ON "pi_session_events" ("session_id","created_at");--> statement-breakpoint
ALTER TABLE "pi_session_events" ADD CONSTRAINT "pi_session_events_session_id_pi_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "pi_sessions"("id") ON DELETE CASCADE;