ALTER TABLE `items` ADD `pinned` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `pinned_at` integer;--> statement-breakpoint
INSERT INTO `items` (`id`, `household_id`, `created_by_id`, `type`, `title`, `body`, `status`, `pinned`, `pinned_at`, `created_at`, `updated_at`)
SELECT `id`, `household_id`, `created_by_id`, 'note', `title`, `body`, 'active', 1, `created_at`, `created_at`, `updated_at`
FROM `pins` WHERE `link_href` IS NULL;--> statement-breakpoint
DELETE FROM `pins` WHERE `link_href` IS NULL;