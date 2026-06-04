PRAGMA foreign_keys=off;
--> statement-breakpoint
CREATE TABLE `ulcer_episodes_new` (
  `id` text PRIMARY KEY NOT NULL,
  `household_id` text NOT NULL,
  `user_id` text NOT NULL,
  `mouth_region` text NOT NULL,
  `x` integer NOT NULL,
  `y` integer NOT NULL,
  `label` text,
  `started_at` integer NOT NULL,
  `healed_at` integer,
  `first_noticed_at` integer NOT NULL,
  `estimated_started_at` integer,
  `resolved_at` integer,
  `status` text NOT NULL DEFAULT 'active',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT "ulcer_episodes_status_check" CHECK(`status` IN ('active', 'healing', 'healed', 'reopened')),
  CONSTRAINT "ulcer_episodes_position_check" CHECK(`x` >= 0 AND `x` <= 100 AND `y` >= 0 AND `y` <= 100),
  CONSTRAINT "ulcer_episodes_date_order_check" CHECK(`healed_at` IS NULL OR `healed_at` >= `started_at`),
  CONSTRAINT "ulcer_episodes_resolved_order_check" CHECK(`resolved_at` IS NULL OR `resolved_at` >= `first_noticed_at`)
);
--> statement-breakpoint
INSERT INTO `ulcer_episodes_new` (
  `id`,
  `household_id`,
  `user_id`,
  `mouth_region`,
  `x`,
  `y`,
  `label`,
  `started_at`,
  `healed_at`,
  `first_noticed_at`,
  `estimated_started_at`,
  `resolved_at`,
  `status`,
  `created_at`,
  `updated_at`
)
SELECT
  `id`,
  `household_id`,
  `user_id`,
  `mouth_region`,
  `x`,
  `y`,
  `label`,
  `started_at`,
  `healed_at`,
  `started_at`,
  `started_at`,
  `healed_at`,
  CASE WHEN `status` = 'healed' OR `healed_at` IS NOT NULL THEN 'healed' ELSE 'active' END,
  `created_at`,
  `updated_at`
FROM `ulcer_episodes`;
--> statement-breakpoint
DROP TABLE `ulcer_episodes`;
--> statement-breakpoint
ALTER TABLE `ulcer_episodes_new` RENAME TO `ulcer_episodes`;
--> statement-breakpoint
CREATE INDEX `ulcer_episodes_user_status_idx` ON `ulcer_episodes` (`user_id`, `status`);
--> statement-breakpoint
CREATE INDEX `ulcer_episodes_started_at_idx` ON `ulcer_episodes` (`started_at`);
--> statement-breakpoint
CREATE INDEX `ulcer_episodes_first_noticed_idx` ON `ulcer_episodes` (`first_noticed_at`);
--> statement-breakpoint
PRAGMA foreign_keys=on;
--> statement-breakpoint
ALTER TABLE `ulcer_checkins` ADD COLUMN `event_type` text NOT NULL DEFAULT 'observation';
--> statement-breakpoint
ALTER TABLE `ulcer_checkins` ADD COLUMN `stage` text;
--> statement-breakpoint
ALTER TABLE `ulcer_checkins` ADD COLUMN `treatments` text DEFAULT '[]';
--> statement-breakpoint
UPDATE `ulcer_checkins`
SET `stage` = 'new'
WHERE `id` IN (
  SELECT `id`
  FROM (
    SELECT
      `id`,
      ROW_NUMBER() OVER (PARTITION BY `episode_id` ORDER BY `logged_at`, `created_at`) AS `row_number`
    FROM `ulcer_checkins`
  )
  WHERE `row_number` = 1
);
--> statement-breakpoint
INSERT INTO `ulcer_checkins` (
  `id`,
  `episode_id`,
  `household_id`,
  `user_id`,
  `logged_at`,
  `event_type`,
  `stage`,
  `severity`,
  `pain`,
  `size_mm`,
  `redness`,
  `triggers`,
  `treatments`,
  `wellbeing`,
  `notes`,
  `created_at`,
  `updated_at`
)
SELECT
  'ulcer-event-healed-' || `id`,
  `id`,
  `household_id`,
  `user_id`,
  `resolved_at`,
  'healed',
  'healed',
  0,
  0,
  0,
  0,
  '[]',
  '[]',
  NULL,
  NULL,
  `resolved_at`,
  `updated_at`
FROM `ulcer_episodes`
WHERE `resolved_at` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `ulcer_checkins`
    WHERE `ulcer_checkins`.`episode_id` = `ulcer_episodes`.`id`
      AND `ulcer_checkins`.`event_type` = 'healed'
  );
--> statement-breakpoint
CREATE INDEX `ulcer_checkins_event_type_idx` ON `ulcer_checkins` (`event_type`);
