CREATE TABLE `google_calendar_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`google_email` text,
	`access_token` text,
	`refresh_token` text NOT NULL,
	`expires_at` integer,
	`scope` text,
	`calendar_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_calendar_connections_user_id_unique` ON `google_calendar_connections` (`user_id`);