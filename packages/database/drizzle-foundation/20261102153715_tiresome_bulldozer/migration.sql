CREATE TABLE "raypx_foundation"."instance_enrollment" (
	"id" text PRIMARY KEY,
	"code_hash" text NOT NULL UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"body" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."runtime_instance" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"body" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "instance_enrollment_expiry_idx" ON "raypx_foundation"."instance_enrollment" ("expires_at");--> statement-breakpoint
CREATE INDEX "runtime_instance_owner_idx" ON "raypx_foundation"."runtime_instance" ("user_id","id");--> statement-breakpoint
ALTER TABLE "raypx_foundation"."runtime_instance" ADD CONSTRAINT "runtime_instance_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;