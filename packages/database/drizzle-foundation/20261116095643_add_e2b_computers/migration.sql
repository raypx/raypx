CREATE TABLE "computer_e2b_homes" (
	"space_id" text,
	"computer_id" text,
	"template" text NOT NULL,
	"sandbox_id" text,
	"sandbox_generation" bigint,
	"create_key" text,
	"ready" boolean DEFAULT false NOT NULL,
	"destroyed" boolean DEFAULT false NOT NULL,
	"home_revision" text,
	"archive" jsonb,
	CONSTRAINT "computer_e2b_homes_pkey" PRIMARY KEY("space_id","computer_id"),
	CONSTRAINT "computer_e2b_instance_check" CHECK (("create_key" is null or "sandbox_generation" is not null) and ("sandbox_id" is null or "sandbox_generation" is not null) and (not "ready" or "sandbox_id" is not null)),
	CONSTRAINT "computer_e2b_archive_check" CHECK (("home_revision" is null and "archive" is null) or ("home_revision" is not null and "home_revision" ~ '^[a-f0-9]{64}$' and "archive" is not null and octet_length("archive"::text) <= 71303168))
);
--> statement-breakpoint
ALTER TABLE "computers" ADD COLUMN "e2b_placed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sandbox_configuration" ADD COLUMN "template" text;--> statement-breakpoint
ALTER TABLE "computer_e2b_homes" ADD CONSTRAINT "computer_e2b_homes_qZksMmOBP7yl_fkey" FOREIGN KEY ("space_id","computer_id") REFERENCES "computers"("space_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "computers" ADD CONSTRAINT "computers_placement_check" CHECK (not "e2b_placed" or ("supervisor_url" is null and "provider" = 'sandbox'));