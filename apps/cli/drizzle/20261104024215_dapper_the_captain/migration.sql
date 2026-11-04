CREATE TABLE `host_authorizations` (
	`api_url` text NOT NULL,
	`account_id` text NOT NULL,
	`device_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`authorization` text NOT NULL,
	CONSTRAINT `host_authorizations_pk` PRIMARY KEY(`api_url`, `account_id`, `device_id`, `epoch`),
	CONSTRAINT "host_epoch_positive" CHECK("epoch" > 0)
);
--> statement-breakpoint
CREATE TABLE `instance_credentials` (
	`instance_id` text PRIMARY KEY,
	`private_key` blob NOT NULL,
	CONSTRAINT "instance_key_size" CHECK(length("private_key") BETWEEN 1 AND 4096)
);
