ALTER TABLE `guild_farewell` ADD `text_message_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `guild_farewell` ADD `text_message` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `guild_welcomer` ADD `text_message_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `guild_welcomer` ADD `text_message` text DEFAULT '' NOT NULL;