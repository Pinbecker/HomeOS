CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`icon` text,
	`fields` text,
	`renewal_date` integer,
	`renewal_label` text,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `bins` ADD `interval_weeks` integer DEFAULT 1 NOT NULL;