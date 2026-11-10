PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_generated_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invite_id` text NOT NULL,
	`first_name` text NOT NULL,
	`max_guests` integer NOT NULL,
	`source_sheet` text NOT NULL,
	`source_row` integer,
	`short_link` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_generated_invites`("id", "invite_id", "first_name", "max_guests", "source_sheet", "source_row", "short_link", "created_by", "created_at", "updated_at") SELECT "id", "invite_id", "first_name", "max_guests", "source_sheet", "source_row", "short_link", "created_by", "created_at", "updated_at" FROM `generated_invites`;--> statement-breakpoint
DROP TABLE `generated_invites`;--> statement-breakpoint
ALTER TABLE `__new_generated_invites` RENAME TO `generated_invites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `generated_invites_invite_id_unique` ON `generated_invites` (`invite_id`);--> statement-breakpoint
CREATE TABLE `__new_invite_visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invite_id` text NOT NULL,
	`first_name` text DEFAULT '' NOT NULL,
	`source_sheet` text NOT NULL,
	`source_row` integer,
	`first_opened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_opened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`open_count` integer DEFAULT 1 NOT NULL,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`sync_error` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_invite_visits`("id", "invite_id", "first_name", "source_sheet", "source_row", "first_opened_at", "last_opened_at", "open_count", "sync_status", "sync_error") SELECT "id", "invite_id", "first_name", "source_sheet", "source_row", "first_opened_at", "last_opened_at", "open_count", "sync_status", "sync_error" FROM `invite_visits`;--> statement-breakpoint
DROP TABLE `invite_visits`;--> statement-breakpoint
ALTER TABLE `__new_invite_visits` RENAME TO `invite_visits`;--> statement-breakpoint
CREATE UNIQUE INDEX `invite_visits_invite_id_unique` ON `invite_visits` (`invite_id`);