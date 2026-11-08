CREATE TABLE "raypx_foundation"."system_configuration" (
	"id" text PRIMARY KEY,
	"site_name" text NOT NULL,
	"registration_enabled" boolean NOT NULL,
	"cleanup_enabled" boolean NOT NULL,
	"revision" integer NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raypx_foundation"."system_configuration" ADD CONSTRAINT "system_configuration_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "raypx_foundation"."user"("id") ON DELETE SET NULL;