CREATE TABLE `call_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`invite_id` text NOT NULL,
	`caller_id` text,
	`caller_name` text NOT NULL,
	`phone` text NOT NULL,
	`clicked_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `call_attempts_invite_time_idx` ON `call_attempts` (`invite_id`,`clicked_at`);--> statement-breakpoint
CREATE TABLE `call_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`opening_script` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
