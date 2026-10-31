CREATE TABLE `activity` (
	`id` text PRIMARY KEY,
	`binding` text NOT NULL,
	`task_id` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agent_meta` (
	`id` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`id` text PRIMARY KEY,
	`payload` text NOT NULL,
	`result` text
);
--> statement-breakpoint
CREATE TABLE `deleted_documents` (
	`id` text PRIMARY KEY,
	`owner` text NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `documents_pk` PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `journal` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT,
	`id` text NOT NULL UNIQUE,
	`binding` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT,
	`id` text NOT NULL UNIQUE,
	`binding` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pi_contexts` (
	`context_id` text PRIMARY KEY,
	`revision` integer NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "revision_positive" CHECK("revision" > 0),
	CONSTRAINT "revision_integer" CHECK(typeof("revision") = 'integer'),
	CONSTRAINT "context_id_text" CHECK(typeof("context_id") = 'text'),
	CONSTRAINT "value_text" CHECK(typeof("value") = 'text')
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY,
	`providers` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` text PRIMARY KEY,
	`binding` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roots` (
	`id` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY,
	`jobId` text NOT NULL,
	`startedAt` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminal_project` (
	`path` text PRIMARY KEY,
	`id` text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE `terminal_receipt` (
	`id` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminal_request` (
	`id` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminal_session` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `versions` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`revision` integer NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `versions_pk` PRIMARY KEY(`owner`, `id`, `revision`)
);
--> statement-breakpoint
CREATE INDEX `activity_task` ON `activity` (`binding`,`task_id`);--> statement-breakpoint
CREATE INDEX `activity_task_active` ON `activity` (`binding`,`task_id`) WHERE json_extract("activity"."value",'$.status') IN ('streaming','running','queued','sending');--> statement-breakpoint
CREATE INDEX `commands_binding` ON `commands` (json_extract("payload",'$.binding'));--> statement-breakpoint
CREATE INDEX `documents_canonical_idx` ON `documents` (lower("id"));--> statement-breakpoint
CREATE INDEX `journal_binding` ON `journal` (`binding`,`sequence`);--> statement-breakpoint
CREATE INDEX `journal_task` ON `journal` (`binding`,json_extract("value",'$.taskId'),`sequence`);--> statement-breakpoint
CREATE INDEX `requests_binding_task` ON `requests` (`binding`,json_extract("value",'$.taskId'));--> statement-breakpoint
CREATE INDEX `requests_binding_pending` ON `requests` (`binding`,json_extract("value",'$.expiresAt')) WHERE json_extract("requests"."value",'$.status') IN ('pending','decided');--> statement-breakpoint
CREATE INDEX `tasks_binding_created` ON `tasks` (json_extract("value",'$.binding'),json_extract("value",'$.task.createdAt') DESC,"id" ASC);--> statement-breakpoint
CREATE INDEX `tasks_binding_active` ON `tasks` (json_extract("value",'$.binding'),json_extract("value",'$.task.createdAt') DESC,"id" ASC) WHERE json_extract("tasks"."value",'$.task.status') IN ('pending','running','waiting','cancelling');--> statement-breakpoint
CREATE INDEX `tasks_binding_cursor` ON `tasks` (json_extract("value",'$.binding'),(json_extract("value",'$.task.createdAt') || ':' || "id") DESC);--> statement-breakpoint
CREATE INDEX `tasks_active_session` ON `tasks` (json_extract("value",'$.task.provider'),json_extract("value",'$.sessionId')) WHERE json_extract("tasks"."value",'$.task.status') IN ('pending','running','waiting','cancelling');