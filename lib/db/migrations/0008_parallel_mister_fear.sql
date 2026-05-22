CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `execution_results` text;--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `final_response` text;--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `model` text;--> statement-breakpoint
ALTER TABLE `ai_jobs` ADD `raw_model_output` text;