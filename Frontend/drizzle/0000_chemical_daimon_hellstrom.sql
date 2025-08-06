CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`form_id` text NOT NULL,
	`scanned_at` integer NOT NULL,
	`data` text NOT NULL,
	`exported` integer DEFAULT 0 NOT NULL,
	`synced` integer DEFAULT 0 NOT NULL
);
