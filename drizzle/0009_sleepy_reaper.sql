CREATE TABLE `call_agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`share_token` text NOT NULL,
	`token_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `call_agents_token_hash_unique` ON `call_agents` (`token_hash`);--> statement-breakpoint
CREATE TABLE `call_tasks` (
	`invite_id` text PRIMARY KEY NOT NULL,
	`caller_id` text,
	`call_status` text,
	`retry_at` text,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
