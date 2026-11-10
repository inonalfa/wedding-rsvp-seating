CREATE TABLE `generated_invites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invite_id` text NOT NULL,
	`first_name` text NOT NULL,
	`max_guests` integer NOT NULL,
	`source_sheet` text NOT NULL,
	`source_row` integer NOT NULL,
	`short_link` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generated_invites_invite_id_unique` ON `generated_invites` (`invite_id`);