CREATE TABLE IF NOT EXISTS `media_items` (
  `id` text PRIMARY KEY NOT NULL,
  `tmdb_id` integer NOT NULL,
  `media_type` text NOT NULL,
  `title` text NOT NULL,
  `original_title` text,
  `overview` text,
  `poster_path` text,
  `backdrop_path` text,
  `release_date` text,
  `first_air_date` text,
  `year` integer,
  `runtime_minutes` integer,
  `episode_run_time` text,
  `genres` text,
  `origin_country` text,
  `original_language` text,
  `vote_average_x10` integer,
  `vote_count` integer,
  `popularity_x100` integer,
  `providers` text,
  `seasons` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `media_items_tmdb_unique_idx` ON `media_items` (`media_type`,`tmdb_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_items_type_idx` ON `media_items` (`media_type`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `media_user_states` (
  `id` text PRIMARY KEY NOT NULL,
  `household_id` text NOT NULL,
  `user_id` text NOT NULL,
  `media_item_id` text NOT NULL,
  `status` text NOT NULL,
  `rating` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `media_user_states_user_media_unique_idx` ON `media_user_states` (`user_id`,`media_item_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_user_states_user_status_idx` ON `media_user_states` (`user_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `media_family_states` (
  `id` text PRIMARY KEY NOT NULL,
  `household_id` text NOT NULL,
  `media_item_id` text NOT NULL,
  `status` text NOT NULL,
  `added_by_user_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`added_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `media_family_states_household_media_unique_idx` ON `media_family_states` (`household_id`,`media_item_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_family_states_household_status_idx` ON `media_family_states` (`household_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `media_seasons` (
  `id` text PRIMARY KEY NOT NULL,
  `media_item_id` text NOT NULL,
  `season_number` integer NOT NULL,
  `name` text NOT NULL,
  `overview` text,
  `poster_path` text,
  `air_date` text,
  `episode_count` integer DEFAULT 0 NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `media_seasons_media_season_unique_idx` ON `media_seasons` (`media_item_id`,`season_number`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `media_episodes` (
  `id` text PRIMARY KEY NOT NULL,
  `media_item_id` text NOT NULL,
  `season_id` text NOT NULL,
  `season_number` integer NOT NULL,
  `episode_number` integer NOT NULL,
  `name` text NOT NULL,
  `overview` text,
  `still_path` text,
  `air_date` text,
  `runtime_minutes` integer,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`season_id`) REFERENCES `media_seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `media_episodes_media_episode_unique_idx` ON `media_episodes` (`media_item_id`,`season_number`,`episode_number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_episodes_media_season_idx` ON `media_episodes` (`media_item_id`,`season_number`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `media_episode_progress` (
  `id` text PRIMARY KEY NOT NULL,
  `household_id` text NOT NULL,
  `scope_type` text NOT NULL,
  `scope_id` text NOT NULL,
  `media_item_id` text NOT NULL,
  `episode_id` text NOT NULL,
  `watched_at` integer,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`episode_id`) REFERENCES `media_episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `media_episode_progress_scope_episode_unique_idx` ON `media_episode_progress` (`scope_type`,`scope_id`,`episode_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_episode_progress_scope_media_idx` ON `media_episode_progress` (`scope_type`,`scope_id`,`media_item_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `media_interactions` (
  `id` text PRIMARY KEY NOT NULL,
  `household_id` text NOT NULL,
  `user_id` text NOT NULL,
  `media_item_id` text NOT NULL,
  `action` text NOT NULL,
  `source` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`media_item_id`) REFERENCES `media_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_interactions_user_created_idx` ON `media_interactions` (`user_id`,`created_at`);
