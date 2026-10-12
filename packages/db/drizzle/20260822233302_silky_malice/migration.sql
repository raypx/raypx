DROP INDEX "auth_accounts_provider_account_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_account_idx" ON "auth_accounts" ("provider_id","account_id");