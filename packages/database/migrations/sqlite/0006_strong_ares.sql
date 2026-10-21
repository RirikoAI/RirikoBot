CREATE TABLE `ticket_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`is_enabled` integer DEFAULT false NOT NULL,
	`category_id` text,
	`staff_role_ids` text DEFAULT '[]' NOT NULL,
	`transcript_channel_id` text,
	`max_open_per_user` integer DEFAULT 1 NOT NULL,
	`welcome_message` text,
	`next_number` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`number` integer NOT NULL,
	`channel_id` text NOT NULL,
	`opener_id` text NOT NULL,
	`subject` text,
	`status` text DEFAULT 'open' NOT NULL,
	`claimed_by` text,
	`closed_by` text,
	`close_reason` text,
	`created_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tickets_guild_number` ON `tickets` (`guild_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_tickets_channel` ON `tickets` (`channel_id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_guild_opener_status` ON `tickets` (`guild_id`,`opener_id`,`status`);