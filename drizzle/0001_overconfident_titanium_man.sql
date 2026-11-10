CREATE TABLE `rsvp_responses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invite_id` text,
	`first_name` text DEFAULT '' NOT NULL,
	`invited_name` text DEFAULT '' NOT NULL,
	`full_name` text NOT NULL,
	`phone` text NOT NULL,
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
CREATE UNIQUE INDEX `rsvp_responses_invite_id_unique` ON `rsvp_responses` (`invite_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rsvp_responses_phone_unique` ON `rsvp_responses` (`phone`);