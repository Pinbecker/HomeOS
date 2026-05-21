CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_id` text NOT NULL,
	`origin_job_id` text,
	`origin_item_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`messages` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`origin_job_id`) REFERENCES `ai_jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`origin_item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_id` text NOT NULL,
	`input_type` text DEFAULT 'text' NOT NULL,
	`source_type` text DEFAULT 'typed_capture' NOT NULL,
	`source_context` text,
	`conversation_id` text,
	`related_entity_ids` text,
	`transcript_confidence` integer,
	`raw_input` text NOT NULL,
	`classification` text,
	`actions_taken` text,
	`status` text DEFAULT 'captured' NOT NULL,
	`reviewed_by_id` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_ai_jobs`("id", "household_id", "created_by_id", "input_type", "source_type", "source_context", "conversation_id", "related_entity_ids", "transcript_confidence", "raw_input", "classification", "actions_taken", "status", "reviewed_by_id", "reviewed_at", "created_at", "updated_at")
SELECT
	"id",
	"household_id",
	"created_by_id",
	"input_type",
	'typed_capture',
	NULL,
	NULL,
	'[]',
	NULL,
	"raw_input",
	"classification",
	"actions_taken",
	CASE
		WHEN "status" = 'confirmed' THEN 'applied'
		WHEN "status" = 'pending' THEN 'captured'
		ELSE "status"
	END,
	"reviewed_by_id",
	"reviewed_at",
	"created_at",
	"updated_at"
FROM `ai_jobs`;--> statement-breakpoint
DROP TABLE `ai_jobs`;--> statement-breakpoint
ALTER TABLE `__new_ai_jobs` RENAME TO `ai_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
