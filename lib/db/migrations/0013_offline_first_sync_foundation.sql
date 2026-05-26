ALTER TABLE `list_items` ADD `updated_at` integer;
--> statement-breakpoint
ALTER TABLE `list_items` ADD `deleted_at` integer;
--> statement-breakpoint
CREATE TABLE `sync_changes` (
  `version` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `household_id` text,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `operation` text NOT NULL,
  `payload` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sync_changes_entity_idx` ON `sync_changes` (`entity_type`, `entity_id`);
--> statement-breakpoint
CREATE INDEX `sync_changes_household_idx` ON `sync_changes` (`household_id`, `version`);
--> statement-breakpoint
CREATE TABLE `applied_mutations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text,
  `device_id` text,
  `mutation_name` text NOT NULL,
  `mutation_body` text NOT NULL,
  `result_body` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
