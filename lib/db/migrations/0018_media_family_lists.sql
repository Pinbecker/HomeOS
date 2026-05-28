ALTER TABLE `media_family_states` ADD `rating` text;
--> statement-breakpoint
ALTER TABLE `media_family_states` ADD `watchlist` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `media_family_states` SET `watchlist` = 1 WHERE `status` = 'wishlist';
