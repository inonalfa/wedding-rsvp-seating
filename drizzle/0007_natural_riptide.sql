CREATE TABLE `seating_plans` (
	`id` integer PRIMARY KEY NOT NULL,
	`document` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `seating_sources` (
	`id` integer PRIMARY KEY NOT NULL,
	`document` text NOT NULL,
	`fetched_at` text NOT NULL
);
