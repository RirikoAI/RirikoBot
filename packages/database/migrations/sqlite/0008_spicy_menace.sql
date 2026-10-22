CREATE TABLE `level_role_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`rewards` text DEFAULT '[]' NOT NULL,
	`keep_previous_roles` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
