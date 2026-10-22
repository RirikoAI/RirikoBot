CREATE TABLE `starboard_posts` (
	`message_id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`author_id` text NOT NULL,
	`starboard_message_id` text,
	`star_count` integer DEFAULT 0 NOT NULL,
	`removed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_starboard_posts_guild` ON `starboard_posts` (`guild_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_starboard_posts_starboard_message` ON `starboard_posts` (`starboard_message_id`);--> statement-breakpoint
CREATE TABLE `starboard_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`channel_id` text,
	`emoji` text DEFAULT '⭐' NOT NULL,
	`threshold` integer DEFAULT 3 NOT NULL,
	`allow_self_star` integer DEFAULT false NOT NULL,
	`ignored_channel_ids` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL
);
