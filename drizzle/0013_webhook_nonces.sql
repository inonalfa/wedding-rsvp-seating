CREATE TABLE `webhook_nonces` (
	`key` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `webhook_nonces_expiry_idx` ON `webhook_nonces` (`expires_at`);