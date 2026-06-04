CREATE TABLE `ulcer_episodes` (
  `id` text PRIMARY KEY NOT NULL,
  `household_id` text NOT NULL,
  `user_id` text NOT NULL,
  `mouth_region` text NOT NULL,
  `x` integer NOT NULL,
  `y` integer NOT NULL,
  `label` text,
  `started_at` integer NOT NULL,
  `healed_at` integer,
  `status` text NOT NULL DEFAULT 'active',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "ulcer_episodes_status_check" CHECK(`status` IN ('active', 'healed')),
  CONSTRAINT "ulcer_episodes_position_check" CHECK(`x` >= 0 AND `x` <= 100 AND `y` >= 0 AND `y` <= 100),
  CONSTRAINT "ulcer_episodes_date_order_check" CHECK(`healed_at` IS NULL OR `healed_at` >= `started_at`)
);
--> statement-breakpoint
CREATE INDEX `ulcer_episodes_user_status_idx` ON `ulcer_episodes` (`user_id`, `status`);
--> statement-breakpoint
CREATE INDEX `ulcer_episodes_started_at_idx` ON `ulcer_episodes` (`started_at`);
--> statement-breakpoint
CREATE TABLE `ulcer_checkins` (
  `id` text PRIMARY KEY NOT NULL,
  `episode_id` text NOT NULL,
  `household_id` text NOT NULL,
  `user_id` text NOT NULL,
  `logged_at` integer NOT NULL,
  `severity` integer NOT NULL,
  `pain` integer NOT NULL,
  `size_mm` integer NOT NULL,
  `redness` integer,
  `triggers` text DEFAULT '[]',
  `wellbeing` text,
  `notes` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`episode_id`) REFERENCES `ulcer_episodes`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "ulcer_checkins_severity_check" CHECK(`severity` >= 0 AND `severity` <= 10),
  CONSTRAINT "ulcer_checkins_pain_check" CHECK(`pain` >= 0 AND `pain` <= 10),
  CONSTRAINT "ulcer_checkins_size_check" CHECK(`size_mm` >= 0 AND `size_mm` <= 50),
  CONSTRAINT "ulcer_checkins_redness_check" CHECK(`redness` IS NULL OR (`redness` >= 0 AND `redness` <= 10))
);
--> statement-breakpoint
CREATE INDEX `ulcer_checkins_episode_logged_idx` ON `ulcer_checkins` (`episode_id`, `logged_at`);
--> statement-breakpoint
CREATE INDEX `ulcer_checkins_user_logged_idx` ON `ulcer_checkins` (`user_id`, `logged_at`);
