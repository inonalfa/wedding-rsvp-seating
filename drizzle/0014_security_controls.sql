CREATE TABLE `invite_controls` (
	`invite_id` text PRIMARY KEY NOT NULL,
	`expires_at` integer,
	`revoked_at` text
);
--> statement-breakpoint
CREATE TABLE `auth_lockouts` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`locked_until` integer NOT NULL
);
