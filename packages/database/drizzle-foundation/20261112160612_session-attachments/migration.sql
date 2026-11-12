CREATE TABLE "raypx_foundation"."session_attachment" (
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
CREATE TABLE "raypx_foundation"."storage_configuration" (
	"id" text PRIMARY KEY,
	"endpoint" text NOT NULL,
	"region" text NOT NULL,
	"bucket" text NOT NULL,
	"credentials" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "session_attachment_owner_idx" ON "raypx_foundation"."session_attachment" ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "session_attachment_expiry_idx" ON "raypx_foundation"."session_attachment" ("expires_at");--> statement-breakpoint
ALTER TABLE "raypx_foundation"."session_attachment" ADD CONSTRAINT "session_attachment_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;