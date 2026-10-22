CREATE TABLE `event_log_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`message_channel_id` text,
	`member_channel_id` text,
	`server_channel_id` text,
	`voice_channel_id` text,
	`ignored_channel_ids` text DEFAULT '[]' NOT NULL,
	`ignore_bots` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
