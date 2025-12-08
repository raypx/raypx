CREATE TYPE "public"."invoice_status" AS ENUM('paid', 'pending', 'failed', 'void');--> statement-breakpoint
CREATE TYPE "public"."payment_method_type" AS ENUM('card', 'bank_account', 'paypal');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'canceled', 'past_due', 'trialing', 'incomplete');--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"subscription_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"invoice_number" text NOT NULL,
	"invoice_date" timestamp NOT NULL,
	"due_date" timestamp,
	"paid_at" timestamp,
	"pdf_url" text,
	"stripe_invoice_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "invoice_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "payment_method" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"type" "payment_method_type" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last4" text,
	"brand" text,
	"exp_month" integer,
	"exp_year" integer,
	"stripe_payment_method_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"plan_id" text NOT NULL,
	"status" "subscription_status" DEFAULT 'incomplete' NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apikey" ALTER COLUMN "request_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "disabled" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "oauth_application" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "banned" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method" ADD CONSTRAINT "payment_method_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_method" ADD CONSTRAINT "payment_method_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoice_organization_id" ON "invoice" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_user_id" ON "invoice" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_subscription_id" ON "invoice" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_status" ON "invoice" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invoice_stripe_invoice_id" ON "invoice" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "idx_payment_method_organization_id" ON "payment_method" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_payment_method_user_id" ON "payment_method" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_payment_method_stripe_payment_method_id" ON "payment_method" USING btree ("stripe_payment_method_id");--> statement-breakpoint
CREATE INDEX "idx_subscription_organization_id" ON "subscription" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_subscription_user_id" ON "subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscription_status" ON "subscription" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_subscription_stripe_subscription_id" ON "subscription" USING btree ("stripe_subscription_id");--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_application_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_application"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_application_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_application"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_organization_slug" ON "organization" USING btree ("slug");