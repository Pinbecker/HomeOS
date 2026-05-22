CREATE TABLE `tv_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`logo` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tv_programmes` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`icon_url` text,
	`episode_num` text
);
--> statement-breakpoint
CREATE INDEX `tv_prog_channel_start_idx` ON `tv_programmes` (`channel_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `tv_prog_start_idx` ON `tv_programmes` (`starts_at`);