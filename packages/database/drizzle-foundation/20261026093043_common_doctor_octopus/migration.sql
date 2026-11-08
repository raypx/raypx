CREATE TABLE "raypx_foundation"."context_document" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"content" text NOT NULL,
	"project" jsonb,
	"revision" integer NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raypx_foundation"."context_version" (
	"document_id" text,
	"user_id" text NOT NULL,
	"revision" integer,
	"body" jsonb NOT NULL,
	CONSTRAINT "context_version_pkey" PRIMARY KEY("document_id","revision")
);
--> statement-breakpoint
CREATE INDEX "context_document_owner_idx" ON "raypx_foundation"."context_document" ("user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "context_version_owner_idx" ON "raypx_foundation"."context_version" ("user_id","document_id","revision");--> statement-breakpoint
ALTER TABLE "raypx_foundation"."context_document" ADD CONSTRAINT "context_document_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."context_version" ADD CONSTRAINT "context_version_document_id_context_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "raypx_foundation"."context_document"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "raypx_foundation"."context_version" ADD CONSTRAINT "context_version_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "raypx_foundation"."user"("id") ON DELETE CASCADE;