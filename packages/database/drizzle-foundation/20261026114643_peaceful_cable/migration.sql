CREATE TABLE "raypx_foundation"."context_deletion" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"revision" integer NOT NULL,
	"deleted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "context_deletion_owner_idx" ON "raypx_foundation"."context_deletion" ("user_id");--> statement-breakpoint
ALTER TABLE "raypx_foundation"."context_deletion" ADD CONSTRAINT "context_deletion_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;