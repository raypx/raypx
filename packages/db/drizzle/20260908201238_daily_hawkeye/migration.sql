CREATE TABLE "asset_references" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"version_id" text,
	"workspace_id" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "asset_references_project_id_asset_id_idx" ON "asset_references" ("project_id","asset_id");--> statement-breakpoint
CREATE INDEX "asset_references_project_id_created_at_idx" ON "asset_references" ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "asset_references_asset_id_idx" ON "asset_references" ("asset_id");--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_asset_id_assets_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_version_id_asset_versions_id_fkey" FOREIGN KEY ("version_id") REFERENCES "asset_versions"("id") ON DELETE SET NULL;