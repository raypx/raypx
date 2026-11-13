CREATE TABLE "raypx_foundation"."mail_configuration" (
	"id" text PRIMARY KEY,
	"sender" text NOT NULL,
	"default_locale" text NOT NULL,
	"enabled" boolean NOT NULL,
	"credentials" text NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
