ALTER TABLE `media_user_states` ADD `watchlist` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `media_user_states` SET `watchlist` = 1 WHERE `status` = 'wishlist';
