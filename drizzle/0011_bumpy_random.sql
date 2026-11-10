CREATE TABLE `rsvp_invite_resolutions` (
	`invite_id` text PRIMARY KEY NOT NULL,
	`canonical_id` text,
	`reconciliation_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rsvp_reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`before_document` text NOT NULL,
	`source_document` text NOT NULL,
	`decisions_document` text NOT NULL,
	`created_at` text NOT NULL
);
