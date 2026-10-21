CREATE TABLE "raypx_foundation"."control_command" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_command_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."control_device" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_device_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."control_event" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_event_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."control_grant" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_grant_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."control_owner" (
	"user_id" text PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."control_project" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_project_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."control_request" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_request_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."control_task" (
	"id" text,
	"user_id" text,
	"device_id" text NOT NULL,
	"body" jsonb NOT NULL,
	CONSTRAINT "control_task_pkey" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE INDEX "control_command_device_idx" ON "raypx_foundation"."control_command" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_device_device_idx" ON "raypx_foundation"."control_device" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_event_device_idx" ON "raypx_foundation"."control_event" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_grant_device_idx" ON "raypx_foundation"."control_grant" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_project_device_idx" ON "raypx_foundation"."control_project" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_request_device_idx" ON "raypx_foundation"."control_request" ("user_id","device_id");--> statement-breakpoint
CREATE INDEX "control_task_device_idx" ON "raypx_foundation"."control_task" ("user_id","device_id");--> statement-breakpoint
ALTER TABLE "raypx_foundation"."control_command" ADD CONSTRAINT "control_command_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."control_device" ADD CONSTRAINT "control_device_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."control_event" ADD CONSTRAINT "control_event_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."control_grant" ADD CONSTRAINT "control_grant_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."control_owner" ADD CONSTRAINT "control_owner_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."control_project" ADD CONSTRAINT "control_project_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."control_request" ADD CONSTRAINT "control_request_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."control_task" ADD CONSTRAINT "control_task_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;