CREATE TABLE "raypx_foundation"."rate_limit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_last_request_idx" ON "raypx_foundation"."rate_limit" ("last_request");