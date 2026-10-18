CREATE TABLE `guild_members` (
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`nickname` text,
	`joined_at` integer NOT NULL,
	`roles` text DEFAULT '[]' NOT NULL,
	`is_in_guild` integer DEFAULT true NOT NULL,
	PRIMARY KEY(`guild_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `guild_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`prefix` text DEFAULT '!' NOT NULL,
	`locale` text DEFAULT 'en-US' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`ai_channel_id` text,
	`log_channel_id` text,
	`escalation_steps` text,
	`music_channel_id` text,
	`welcomer_channel_id` text,
	`welcomer_enabled` integer DEFAULT false NOT NULL,
	`welcomer_bg` text,
	`farewell_channel_id` text,
	`farewell_enabled` integer DEFAULT false NOT NULL,
	`farewell_bg` text,
	`karma_notifications_enabled` integer DEFAULT true NOT NULL,
	`level_up_channel_id` text,
	`xp_rate_percent` integer DEFAULT 100 NOT NULL,
	`no_xp_channel_ids` text DEFAULT '[]' NOT NULL,
	`no_xp_role_ids` text DEFAULT '[]' NOT NULL,
	`voice_xp_enabled` integer DEFAULT false NOT NULL,
	`max_game_wager` integer,
	`tcg_drops_enabled` integer DEFAULT false NOT NULL,
	`tcg_drop_channel_id` text,
	`tcg_drop_message_threshold` integer DEFAULT 50 NOT NULL,
	`tcg_drop_start_hour` integer DEFAULT 8 NOT NULL,
	`tcg_drop_end_hour` integer DEFAULT 23 NOT NULL,
	`tcg_drop_claim_timeout_seconds` integer DEFAULT 60 NOT NULL,
	`tcg_drop_cooldown_minutes` integer DEFAULT 5 NOT NULL,
	`tcg_manager_role_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guilds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon_url` text,
	`owner_id` text NOT NULL,
	`invited_by_id` text,
	`invited_via` text,
	`joined_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text,
	`avatar_url` text,
	`profile_background_url` text,
	`is_blacklisted` integer DEFAULT false NOT NULL,
	`warn_count` integer DEFAULT 0 NOT NULL,
	`notify_level_up` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `command_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text,
	`command_name` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`cooldown_override` integer,
	`allowed_roles` text DEFAULT '[]' NOT NULL,
	`blocked_roles` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_command_settings_guild_cmd` ON `command_settings` (`guild_id`,`command_name`);--> statement-breakpoint
CREATE TABLE `commands` (
	`name` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`slash_enabled` integer DEFAULT true NOT NULL,
	`prefix_enabled` integer DEFAULT true NOT NULL,
	`default_permission` text,
	`cooldown_seconds` integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `moderation_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`case_number` integer NOT NULL,
	`type` text NOT NULL,
	`target_user_id` text NOT NULL,
	`moderator_user_id` text NOT NULL,
	`reason` text DEFAULT 'No reason provided' NOT NULL,
	`duration_seconds` integer,
	`metadata` text DEFAULT '{}',
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mod_cases_guild_number` ON `moderation_cases` (`guild_id`,`case_number`);--> statement-breakpoint
CREATE INDEX `idx_mod_cases_target` ON `moderation_cases` (`guild_id`,`target_user_id`);--> statement-breakpoint
CREATE TABLE `moderation_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`target_user_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mod_notes_user` ON `moderation_notes` (`guild_id`,`target_user_id`);--> statement-breakpoint
CREATE TABLE `moderation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`rule_type` text NOT NULL,
	`action` text DEFAULT 'WARN' NOT NULL,
	`threshold` integer DEFAULT 3 NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`exempt_roles` text DEFAULT '[]' NOT NULL,
	`exempt_channels` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `moderation_warnings` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`moderator_id` text NOT NULL,
	`reason` text NOT NULL,
	`severity` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mod_warnings_user` ON `moderation_warnings` (`guild_id`,`user_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `economy_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`is_frozen` integer DEFAULT false NOT NULL,
	`daily_streak` integer DEFAULT 0 NOT NULL,
	`last_daily_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `economy_balances` (
	`user_id` text PRIMARY KEY NOT NULL,
	`wallet_balance` integer DEFAULT 0 NOT NULL,
	`bank_balance` integer DEFAULT 0 NOT NULL,
	`bank_capacity` integer DEFAULT 10000 NOT NULL,
	`net_worth` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `economy_config` (
	`id` text PRIMARY KEY NOT NULL,
	`daily_base_reward` integer DEFAULT 250 NOT NULL,
	`daily_streak_bonus_percent` integer DEFAULT 5 NOT NULL,
	`daily_max_streak_bonus_percent` integer DEFAULT 150 NOT NULL,
	`bank_base_capacity` integer DEFAULT 10000 NOT NULL,
	`bank_capacity_per_level` integer DEFAULT 2500 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `economy_cooldowns` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action_type` text NOT NULL,
	`last_triggered_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_economy_cd_user_action` ON `economy_cooldowns` (`user_id`,`action_type`);--> statement-breakpoint
CREATE TABLE `economy_inventories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`acquired_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_economy_inv_user` ON `economy_inventories` (`user_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `idx_economy_inv_item` ON `economy_inventories` (`item_id`);--> statement-breakpoint
CREATE TABLE `economy_item_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`name` text NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_economy_item_categories_code` ON `economy_item_categories` (`code`);--> statement-breakpoint
CREATE TABLE `economy_items` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`price` integer NOT NULL,
	`rarity` text DEFAULT 'COMMON' NOT NULL,
	`category_id` text,
	`icon_url` text,
	`is_purchasable` integer DEFAULT true NOT NULL,
	`metadata` text DEFAULT '{}'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_economy_items_code` ON `economy_items` (`code`);--> statement-breakpoint
CREATE TABLE `economy_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`base_amount` integer DEFAULT 100 NOT NULL,
	`multiplier` integer DEFAULT 1 NOT NULL,
	`cooldown_seconds` integer DEFAULT 86400 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `economy_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`guild_id` text,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'CREDITS' NOT NULL,
	`balance_before` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`source` text NOT NULL,
	`metadata` text DEFAULT '{}',
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_economy_tx_user_created` ON `economy_transactions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_economy_tx_type` ON `economy_transactions` (`type`);--> statement-breakpoint
CREATE TABLE `leaderboard_snapshots` (
	`user_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`global_rank` integer NOT NULL,
	`server_rank` integer NOT NULL,
	`calculated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `guild_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_leaderboard_server_rank` ON `leaderboard_snapshots` (`guild_id`,`server_rank`);--> statement-breakpoint
CREATE TABLE `xp_accounts` (
	`user_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`karma` integer DEFAULT 0 NOT NULL,
	`last_xp_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `guild_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_xp_accounts_guild_xp` ON `xp_accounts` (`guild_id`,`xp`);--> statement-breakpoint
CREATE TABLE `xp_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`xp_awarded` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_xp_events_user_guild` ON `xp_events` (`user_id`,`guild_id`);--> statement-breakpoint
CREATE TABLE `music_channels` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`last_message_id` text
);
--> statement-breakpoint
CREATE TABLE `music_guild_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`default_volume` integer DEFAULT 80 NOT NULL,
	`dj_role_id` text,
	`restrict_voice_channel_id` text,
	`auto_leave_empty` integer DEFAULT true NOT NULL,
	`lyrics_provider` text DEFAULT 'GENIUS' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `music_history` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`track_title` text NOT NULL,
	`track_url` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`source_provider` text NOT NULL,
	`played_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_music_history_guild_played` ON `music_history` (`guild_id`,`played_at`);--> statement-breakpoint
CREATE TABLE `music_playlist_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`duration` integer NOT NULL,
	`thumbnail_url` text,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_music_tracks_playlist` ON `music_playlist_tracks` (`playlist_id`,`position`);--> statement-breakpoint
CREATE TABLE `music_saved_playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_public` integer DEFAULT false NOT NULL,
	`play_count` integer DEFAULT 0 NOT NULL,
	`guild_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_music_playlists_user` ON `music_saved_playlists` (`user_id`);--> statement-breakpoint
CREATE TABLE `ai_channels` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`guild_id` text,
	`channel_id` text,
	`provider` text DEFAULT 'GEMINI' NOT NULL,
	`model` text NOT NULL,
	`summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_conversations_user` ON `ai_conversations` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ai_guild_preferences` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`personality_prompt` text,
	`speaking_style` text DEFAULT 'FRIENDLY_ANIME' NOT NULL,
	`allowed_tools` text DEFAULT '[]' NOT NULL,
	`tools_enabled` integer DEFAULT true NOT NULL,
	`provider_override` text,
	`model_override` text
);
--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text,
	`token_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_messages_conv_created` ON `ai_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`nickname` text,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`language_preference` text DEFAULT 'en' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `image_guild_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`default_provider` text,
	`member_daily_limit` integer,
	`default_preset` text
);
--> statement-breakpoint
CREATE TABLE `image_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`guild_id` text,
	`provider_id` text NOT NULL,
	`prompt` text NOT NULL,
	`negative_prompt` text,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`result_url` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_image_jobs_user_status` ON `image_jobs` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_image_jobs_user_created` ON `image_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `image_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`positive_prompt_prefix` text NOT NULL,
	`negative_prompt_preset` text,
	`is_system_preset` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `image_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`is_free_tier` integer DEFAULT false NOT NULL,
	`rate_limit_per_min` integer DEFAULT 10 NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `image_usage` (
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`images_generated_today` integer DEFAULT 0 NOT NULL,
	`last_reset_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `provider_id`)
);
--> statement-breakpoint
CREATE TABLE `giveaway_entries` (
	`giveaway_id` text NOT NULL,
	`user_id` text NOT NULL,
	`bonus_multiplier` integer DEFAULT 1 NOT NULL,
	`entered_at` integer NOT NULL,
	PRIMARY KEY(`giveaway_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `giveaway_winners` (
	`giveaway_id` text NOT NULL,
	`user_id` text NOT NULL,
	`won_at` integer NOT NULL,
	`is_reroll` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`giveaway_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `giveaways` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`prize` text NOT NULL,
	`winner_count` integer DEFAULT 1 NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`is_ended` integer DEFAULT false NOT NULL,
	`requirements` text DEFAULT '{}',
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_giveaways_guild_active` ON `giveaways` (`guild_id`,`is_ended`);--> statement-breakpoint
CREATE TABLE `stream_announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`announced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stream_announcements_idempotency_key_unique` ON `stream_announcements` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_stream_announcements_key` ON `stream_announcements` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `stream_assets` (
	`stream_id` text PRIMARY KEY NOT NULL,
	`original_url` text NOT NULL,
	`discord_attachment_url` text NOT NULL,
	`file_hash` text NOT NULL,
	`cached_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stream_events` (
	`id` text PRIMARY KEY NOT NULL,
	`streamer_id` text NOT NULL,
	`stream_id` text NOT NULL,
	`title` text NOT NULL,
	`game_name` text,
	`viewer_count` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer
);
--> statement-breakpoint
CREATE TABLE `stream_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`streamer_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`custom_message` text,
	`mention_role_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_stream_subs_streamer` ON `stream_subscriptions` (`streamer_id`);--> statement-breakpoint
CREATE INDEX `idx_stream_subs_guild` ON `stream_subscriptions` (`guild_id`);--> statement-breakpoint
CREATE TABLE `streamers` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`platform_user_id` text NOT NULL,
	`username` text NOT NULL,
	`display_name` text,
	`avatar_url` text,
	`is_live` integer DEFAULT false NOT NULL,
	`last_checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `free_game_announcements` (
	`game_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`announced_at` integer NOT NULL,
	PRIMARY KEY(`game_id`, `guild_id`)
);
--> statement-breakpoint
CREATE TABLE `free_game_channels` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`mention_role_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `free_games` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`title` text NOT NULL,
	`store_url` text NOT NULL,
	`thumbnail_url` text,
	`start_date` integer NOT NULL,
	`end_date` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `boss_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`boss_id` text NOT NULL,
	`user_id` text NOT NULL,
	`damage_dealt` integer NOT NULL,
	`cards_used` text DEFAULT '[]' NOT NULL,
	`performed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_boss_runs_boss` ON `boss_runs` (`boss_id`,`performed_at`);--> statement-breakpoint
CREATE TABLE `bosses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`total_hp` integer NOT NULL,
	`current_hp` integer NOT NULL,
	`element` text NOT NULL,
	`rewards_table` text DEFAULT '{}',
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `card_trades` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_user_id` text NOT NULL,
	`receiver_user_id` text NOT NULL,
	`offered_card_ids` text DEFAULT '[]' NOT NULL,
	`requested_card_ids` text DEFAULT '[]' NOT NULL,
	`offered_credits` integer DEFAULT 0 NOT NULL,
	`requested_credits` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_card_trades_users` ON `card_trades` (`sender_user_id`,`receiver_user_id`);--> statement-breakpoint
CREATE TABLE `dungeon_bosses` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`anime_title` text NOT NULL,
	`element` text NOT NULL,
	`tier` text DEFAULT 'STANDARD' NOT NULL,
	`title` text,
	`flavor_text` text,
	`asset_id` text,
	`anilist_id` integer,
	`danbooru_tag` text,
	`image_path` text,
	`definition` text DEFAULT '{}' NOT NULL,
	`signature_drop_code` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_dungeon_bosses_season_key` ON `dungeon_bosses` (`season_id`,`key`);--> statement-breakpoint
CREATE TABLE `dungeon_floors` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`floor_number` integer NOT NULL,
	`name` text NOT NULL,
	`energy_cost` integer DEFAULT 10 NOT NULL,
	`min_player_level` integer DEFAULT 1 NOT NULL,
	`enemy_lineup` text NOT NULL,
	`floor_affixes` text DEFAULT '[]',
	`is_boss_floor` integer DEFAULT false NOT NULL,
	`first_clear_rewards` text DEFAULT '{}',
	`repeat_rewards_table` text DEFAULT '{}',
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_dungeon_floors_season_floor` ON `dungeon_floors` (`season_id`,`floor_number`);--> statement-breakpoint
CREATE TABLE `dungeon_seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`theme_element` text DEFAULT 'ALL' NOT NULL,
	`seasonal_affixes` text DEFAULT '[]',
	`scaling_model` text DEFAULT 'HYBRID' NOT NULL,
	`scaling_params` text DEFAULT '{}',
	`is_tutorial` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `game_achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`tier` text DEFAULT 'BRONZE' NOT NULL,
	`requirement_type` text NOT NULL,
	`requirement_target` integer DEFAULT 1 NOT NULL,
	`reward_xp` integer DEFAULT 0 NOT NULL,
	`reward_credits` integer DEFAULT 0 NOT NULL,
	`reward_card_id` text,
	`reward_item_id` text,
	`reward_consumables` text DEFAULT '{}',
	`reward_title` text,
	`badge_icon` text,
	`is_hidden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_achievements_code_unique` ON `game_achievements` (`code`);--> statement-breakpoint
CREATE TABLE `game_items` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text NOT NULL,
	`rarity` text DEFAULT 'COMMON' NOT NULL,
	`base_stats` text DEFAULT '{}',
	`battle_perks` text DEFAULT '[]',
	`consumable_effect` text DEFAULT '{}',
	`is_shop_buyable` integer DEFAULT true NOT NULL,
	`shop_price` integer DEFAULT 100 NOT NULL,
	`max_daily_purchases` integer DEFAULT 5 NOT NULL,
	`is_tradeable` integer DEFAULT true NOT NULL,
	`owner_overridden` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_items_code_unique` ON `game_items` (`code`);--> statement-breakpoint
CREATE TABLE `market_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`seller_user_id` text NOT NULL,
	`user_card_id` text NOT NULL,
	`price` integer NOT NULL,
	`tax_paid` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_market_listings_status` ON `market_listings` (`status`);--> statement-breakpoint
CREATE INDEX `idx_market_listings_seller` ON `market_listings` (`seller_user_id`);--> statement-breakpoint
CREATE TABLE `player_energy` (
	`user_id` text PRIMARY KEY NOT NULL,
	`current_energy` integer DEFAULT 100 NOT NULL,
	`max_energy` integer DEFAULT 100 NOT NULL,
	`bonus_energy` integer DEFAULT 0 NOT NULL,
	`daily_energy_pots_used` integer DEFAULT 0 NOT NULL,
	`last_replenished_at` integer NOT NULL,
	`last_reset_date` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quests` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`reward_xp` integer DEFAULT 0 NOT NULL,
	`reward_credits` integer DEFAULT 0 NOT NULL,
	`reward_card_id` text,
	`target_count` integer DEFAULT 1 NOT NULL,
	`type` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tcg_system_configs` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`is_unlocked` integer DEFAULT false NOT NULL,
	`is_claimed` integer DEFAULT false NOT NULL,
	`unlocked_at` integer,
	`claimed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_user_achievements_user_claimed` ON `user_achievements` (`user_id`,`is_claimed`);--> statement-breakpoint
CREATE TABLE `user_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`serial_number` integer NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`exp` integer DEFAULT 0 NOT NULL,
	`battles_won` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'IDLE' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`obtained_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_cards_serial_unique` ON `user_cards` (`card_id`,`serial_number`);--> statement-breakpoint
CREATE INDEX `idx_user_cards_user_state` ON `user_cards` (`user_id`,`state`);--> statement-breakpoint
CREATE INDEX `idx_user_cards_card` ON `user_cards` (`card_id`);--> statement-breakpoint
CREATE TABLE `user_dungeon_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`season_id` text NOT NULL,
	`highest_cleared_floor` integer DEFAULT 0 NOT NULL,
	`attempts_count` integer DEFAULT 0 NOT NULL,
	`clear_count` integer DEFAULT 0 NOT NULL,
	`first_cleared_at` integer,
	`last_attempt_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_dungeon_unique` ON `user_dungeon_progress` (`user_id`,`season_id`);--> statement-breakpoint
CREATE TABLE `user_inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`enhancement_level` integer DEFAULT 0 NOT NULL,
	`equipped_to_card_id` text,
	`slot` text DEFAULT 'NONE' NOT NULL,
	`state` text DEFAULT 'IDLE' NOT NULL,
	`obtained_from` text DEFAULT 'SHOP' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_user_inv_items_user_state` ON `user_inventory_items` (`user_id`,`state`);--> statement-breakpoint
CREATE TABLE `waifu_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`source_image_id` text NOT NULL,
	`character_name` text NOT NULL,
	`anime_title` text NOT NULL,
	`image_hash` text NOT NULL,
	`local_storage_path` text,
	`discord_cdn_url` text,
	`is_deleted_by_request` integer DEFAULT false NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `waifu_assets_image_hash_unique` ON `waifu_assets` (`image_hash`);--> statement-breakpoint
CREATE INDEX `idx_waifu_assets_character` ON `waifu_assets` (`character_name`);--> statement-breakpoint
CREATE TABLE `waifu_card_serials` (
	`card_id` text PRIMARY KEY NOT NULL,
	`next_serial` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `waifu_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`name` text NOT NULL,
	`rarity` text NOT NULL,
	`element` text NOT NULL,
	`attack` integer NOT NULL,
	`defense` integer NOT NULL,
	`speed` integer NOT NULL,
	`health` integer NOT NULL,
	`crit_rate` real DEFAULT 0.05 NOT NULL,
	`skill_name` text,
	`skill_description` text,
	`passive_name` text,
	`passive_description` text,
	`collection_number` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_waifu_cards_rarity` ON `waifu_cards` (`rarity`);--> statement-breakpoint
CREATE INDEX `idx_waifu_cards_element` ON `waifu_cards` (`element`);--> statement-breakpoint
CREATE TABLE `waifu_guild_members` (
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rank` text DEFAULT 'MEMBER' NOT NULL,
	`contribution_xp` integer DEFAULT 0 NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`guild_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `waifu_guilds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`leader_user_id` text NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`guild_xp` integer DEFAULT 0 NOT NULL,
	`guild_bank` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `waifu_guilds_name_unique` ON `waifu_guilds` (`name`);--> statement-breakpoint
CREATE TABLE `waifu_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`attribution_text` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `game_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`host_user_id` text NOT NULL,
	`opponent_user_id` text,
	`wager_amount` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'WAITING' NOT NULL,
	`winner_user_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_game_sessions_guild_status` ON `game_sessions` (`guild_id`,`status`);--> statement-breakpoint
CREATE TABLE `game_statistics` (
	`user_id` text NOT NULL,
	`game_id` text NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`ties` integer DEFAULT 0 NOT NULL,
	`total_wagered` integer DEFAULT 0 NOT NULL,
	`net_profit` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `game_id`)
);
--> statement-breakpoint
CREATE TABLE `mini_games` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`min_players` integer DEFAULT 1 NOT NULL,
	`max_players` integer DEFAULT 2 NOT NULL,
	`allow_wagers` integer DEFAULT true NOT NULL,
	`cooldown_seconds` integer DEFAULT 10 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `adventure_choices` (
	`session_id` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`session_id`, `revision`),
	FOREIGN KEY (`session_id`) REFERENCES `adventure_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `adventure_players` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_start_at` integer DEFAULT 0 NOT NULL,
	`cooldown_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `adventure_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`revision` integer NOT NULL,
	`delivered_revision` integer DEFAULT -1 NOT NULL,
	`status` text NOT NULL,
	`deadline` integer NOT NULL,
	`created_at` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_adventure_active_user` ON `adventure_sessions` (`user_id`) WHERE "adventure_sessions"."status" IN ('ACTIVE', 'SETTLING');--> statement-breakpoint
CREATE INDEX `idx_adventure_due` ON `adventure_sessions` (`status`,`deadline`);--> statement-breakpoint
CREATE INDEX `idx_adventure_user_created` ON `adventure_sessions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `adventure_settings` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`energy_enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`details` text DEFAULT '{}',
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_guild_created` ON `audit_logs` (`guild_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auto_voice_channels` (
	`channel_id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`parent_channel_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auto_voice_channels_guild` ON `auto_voice_channels` (`guild_id`);--> statement-breakpoint
CREATE TABLE `auto_voice_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`parent_channel_id` text NOT NULL,
	`channel_name_template` text DEFAULT '{user}''s Room' NOT NULL,
	`user_limit` integer DEFAULT 0 NOT NULL,
	`bitrate` integer DEFAULT 64000 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guild_auto_roles` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`human_role_ids` text DEFAULT '[]' NOT NULL,
	`bot_role_ids` text DEFAULT '[]' NOT NULL,
	`verification_role_id` text,
	`verification_channel_id` text,
	`verification_message_id` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guild_farewell` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`message_template` text DEFAULT 'Goodbye {user}!' NOT NULL,
	`card_theme` text DEFAULT 'DEFAULT' NOT NULL,
	`background_url` text,
	`background_file` text,
	`text_color` text DEFAULT '#ffffff' NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guild_welcomer` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`message_template` text DEFAULT 'Welcome to {server}, {user}!' NOT NULL,
	`card_theme` text DEFAULT 'DEFAULT' NOT NULL,
	`background_url` text,
	`background_file` text,
	`text_color` text DEFAULT '#ffffff' NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reaction_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`message_id` text NOT NULL,
	`emoji_or_component_id` text NOT NULL,
	`role_id` text NOT NULL,
	`type` text DEFAULT 'EMOJI' NOT NULL,
	`mode` text DEFAULT 'TOGGLE' NOT NULL,
	`group_id` text,
	`label` text,
	`description` text
);
--> statement-breakpoint
CREATE INDEX `idx_reaction_roles_msg` ON `reaction_roles` (`message_id`,`emoji_or_component_id`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`guild_id` text,
	`channel_id` text NOT NULL,
	`message` text NOT NULL,
	`trigger_at` integer NOT NULL,
	`repeat_interval` text DEFAULT 'NONE' NOT NULL,
	`is_completed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reminders_trigger` ON `reminders` (`trigger_at`,`is_completed`);--> statement-breakpoint
CREATE TABLE `temporary_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`assigned_by` text NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_temporary_roles_expires` ON `temporary_roles` (`expires_at`);--> statement-breakpoint
CREATE TABLE `web_known_devices` (
	`user_id` text NOT NULL,
	`device_hash` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `device_hash`)
);
--> statement-breakpoint
CREATE INDEX `idx_web_known_devices_last_seen` ON `web_known_devices` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `web_passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text DEFAULT '[]' NOT NULL,
	`device_type` text NOT NULL,
	`backed_up` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_web_passkeys_user` ON `web_passkeys` (`user_id`);--> statement-breakpoint
CREATE TABLE `web_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`step_up_at` integer,
	`webauthn_challenge` text,
	`webauthn_challenge_expires_at` integer,
	`discord_access_token` text NOT NULL,
	`discord_refresh_token` text NOT NULL,
	`discord_token_expires_at` integer NOT NULL,
	`dbsc_session_id` text,
	`dbsc_public_key` text
);
--> statement-breakpoint
CREATE INDEX `idx_web_sessions_user` ON `web_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_web_sessions_expires` ON `web_sessions` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_web_sessions_dbsc_session` ON `web_sessions` (`dbsc_session_id`);--> statement-breakpoint
CREATE TABLE `guild_config_versions` (
	`guild_id` text NOT NULL,
	`module` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`guild_id`, `module`)
);
--> statement-breakpoint
CREATE INDEX `idx_guild_config_versions_updated` ON `guild_config_versions` (`updated_at`);--> statement-breakpoint
CREATE TABLE `bot_status` (
	`id` text PRIMARY KEY NOT NULL,
	`gateway_ping_ms` integer,
	`guild_count` integer NOT NULL,
	`version` text NOT NULL,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `command_usage_daily` (
	`guild_id` text NOT NULL,
	`day` text NOT NULL,
	`command_name` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`guild_id`, `day`, `command_name`)
);
--> statement-breakpoint
CREATE TABLE `guild_voice_activity` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`channels` text NOT NULL,
	`updated_at` integer NOT NULL
);
