CREATE TABLE `job_deliveries` (
	`id` text PRIMARY KEY,
	`digest` text NOT NULL,
	`receivedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_webhook_keys` (
	`jobId` text PRIMARY KEY,
	`secret` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `job_deliveries_received_at` ON `job_deliveries` (`receivedAt`);