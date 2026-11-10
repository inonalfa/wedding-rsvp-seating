PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rsvp_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invite_id` text,
	`first_name` text DEFAULT '' NOT NULL,
	`invited_name` text DEFAULT '' NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`attendance` text NOT NULL,
	`guest_count` integer DEFAULT 0 NOT NULL,
	`max_guests` integer DEFAULT 10 NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`source_sheet` text,
	`source_row` integer,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`sync_error` text DEFAULT '' NOT NULL,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_rsvp_responses`("id", "invite_id", "first_name", "invited_name", "full_name", "phone", "attendance", "guest_count", "max_guests", "message", "source_sheet", "source_row", "sync_status", "sync_error", "submitted_at", "updated_at") SELECT "id", "invite_id", "first_name", "invited_name", "full_name", "phone", "attendance", "guest_count", "max_guests", "message", "source_sheet", "source_row", "sync_status", "sync_error", "submitted_at", "updated_at" FROM `rsvp_responses`;--> statement-breakpoint
DROP TABLE `rsvp_responses`;--> statement-breakpoint
ALTER TABLE `__new_rsvp_responses` RENAME TO `rsvp_responses`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `rsvp_responses_invite_id_unique` ON `rsvp_responses` (`invite_id`);