CREATE TABLE "raypx_foundation"."control_credential" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_credential_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."control_observed_request" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_observed_request_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."control_observed_session" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_observed_session_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE INDEX "control_credential_device_idx" ON "raypx_foundation"."control_credential" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_observed_request_device_idx" ON "raypx_foundation"."control_observed_request" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_observed_session_device_idx" ON "raypx_foundation"."control_observed_session" ("user_id","device_id");--> statement-breakpoint
ALTER TABLE "raypx_foundation"."control_credential" ADD CONSTRAINT "control_credential_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."control_observed_request" ADD CONSTRAINT "control_observed_request_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."control_observed_session" ADD CONSTRAINT "control_observed_session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;