CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"ordering" integer DEFAULT 0 NOT NULL,
	"schema_name" text DEFAULT 'public' NOT NULL,
	"table_name" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "resources_schema_name_table_name_unique" UNIQUE("schema_name","table_name")
);
--> statement-breakpoint
CREATE INDEX "idx_resources_schema_name_table_name" ON "resources" USING btree ("schema_name","table_name");