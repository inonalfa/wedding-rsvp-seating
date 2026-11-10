CREATE TABLE `invite_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invite_id` text NOT NULL,
	`first_name` text DEFAULT '' NOT NULL,
	`source_sheet` text NOT NULL,
	`source_row` integer NOT NULL,
	`first_opened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_opened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`open_count` integer DEFAULT 1 NOT NULL,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`sync_error` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_visits_invite_id_unique` ON `invite_visits` (`invite_id`);