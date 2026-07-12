ALTER TABLE `reminders` ADD COLUMN `kind` text NOT NULL DEFAULT 'general';
--> statement-breakpoint
ALTER TABLE `reminders` ADD COLUMN `due_at` integer;
--> statement-breakpoint
ALTER TABLE `reminders` ADD COLUMN `lead_days` integer;
--> statement-breakpoint
ALTER TABLE `reminders` ADD COLUMN `repeat_interval` text;
--> statement-breakpoint
UPDATE `reminders`
SET `due_at` = `trigger_at`
WHERE `due_at` IS NULL;
--> statement-breakpoint
INSERT INTO `reminders` (
  `id`,
  `household_id`,
  `created_by_id`,
  `entity_type`,
  `entity_id`,
  `message`,
  `kind`,
  `due_at`,
  `lead_days`,
  `repeat_interval`,
  `trigger_at`,
  `dispatched_at`,
  `dismissed_at`,
  `created_at`
)
SELECT
  'reminder-renewal-' || `records`.`id`,
  `records`.`household_id`,
  COALESCE(
    (SELECT `household_members`.`user_id` FROM `household_members` WHERE `household_members`.`household_id` = `records`.`household_id` LIMIT 1),
    (SELECT `users`.`id` FROM `users` LIMIT 1)
  ),
  'record',
  `records`.`id`,
  COALESCE(`records`.`renewal_label`, 'Renewal'),
  CASE
    WHEN lower(COALESCE(`records`.`renewal_label`, '')) LIKE '%mot%' THEN 'maintenance'
    WHEN lower(COALESCE(`records`.`renewal_label`, '')) LIKE '%service%' THEN 'maintenance'
    WHEN lower(COALESCE(`records`.`renewal_label`, '')) LIKE '%payment%' THEN 'payment'
    WHEN lower(COALESCE(`records`.`renewal_label`, '')) LIKE '%expiry%' OR lower(COALESCE(`records`.`renewal_label`, '')) LIKE '%expire%' THEN 'expiry'
    ELSE 'renewal'
  END,
  `records`.`renewal_date`,
  7,
  CASE
    WHEN lower(COALESCE(`records`.`renewal_label`, '')) LIKE '%renew%' THEN 'yearly'
    ELSE NULL
  END,
  CAST(strftime('%s', datetime(`records`.`renewal_date` / 1000, 'unixepoch', '-7 days', 'start of day', '+9 hours')) AS integer) * 1000,
  NULL,
  NULL,
  COALESCE(`records`.`created_at`, `records`.`renewal_date`)
FROM `records`
WHERE `records`.`renewal_date` IS NOT NULL
  AND COALESCE(
    (SELECT `household_members`.`user_id` FROM `household_members` WHERE `household_members`.`household_id` = `records`.`household_id` LIMIT 1),
    (SELECT `users`.`id` FROM `users` LIMIT 1)
  ) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM `reminders`
    WHERE `reminders`.`entity_type` = 'record'
      AND `reminders`.`entity_id` = `records`.`id`
      AND `reminders`.`kind` != 'general'
  );
