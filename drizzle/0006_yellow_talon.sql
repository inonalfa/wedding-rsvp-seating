CREATE TABLE `adults_note_exclusions` (
	`token` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `adults_note_exclusions` (`token`) VALUES ('AQEAEgLXkNeh15mb5cPyyPNJTA');
