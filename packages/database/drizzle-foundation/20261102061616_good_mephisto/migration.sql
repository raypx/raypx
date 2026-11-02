ALTER TABLE "raypx_foundation"."session" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."user" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."user" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."user" ADD COLUMN "ban_expires" timestamp with time zone;