CREATE TABLE `task_effects` (
	`id` text PRIMARY KEY,
	`binding` text NOT NULL,
	`task_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`settled_at` text
);
--> statement-breakpoint
CREATE TABLE `task_events` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT,
	`id` text NOT NULL UNIQUE,
	`binding` text NOT NULL,
	`task_id` text NOT NULL,
	`type` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_effects_task` ON `task_effects` (`binding`,`task_id`);--> statement-breakpoint
CREATE INDEX `task_effects_open` ON `task_effects` (`status`);--> statement-breakpoint
CREATE INDEX `task_effects_settled` ON `task_effects` (`settled_at`);--> statement-breakpoint
CREATE INDEX `task_events_task` ON `task_events` (`binding`,`task_id`,`sequence`);