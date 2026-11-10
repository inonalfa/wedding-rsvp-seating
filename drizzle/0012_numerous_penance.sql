CREATE TABLE `public_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`hits` integer NOT NULL
);
