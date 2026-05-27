CREATE TABLE `cycle_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cycle_entries_date_order_check" CHECK("cycle_entries"."end_date" IS NULL OR "cycle_entries"."end_date" >= "cycle_entries"."start_date")
);
--> statement-breakpoint
CREATE INDEX `cycle_entries_start_date_idx` ON `cycle_entries` (`start_date`);
