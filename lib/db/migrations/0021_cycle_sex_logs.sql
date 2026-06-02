CREATE TABLE `cycle_sex_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `household_id` text NOT NULL,
  `logged_date` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cycle_sex_logs_logged_date_idx` ON `cycle_sex_logs` (`logged_date`);
--> statement-breakpoint
CREATE UNIQUE INDEX `cycle_sex_logs_household_date_unique` ON `cycle_sex_logs` (`household_id`, `logged_date`);
