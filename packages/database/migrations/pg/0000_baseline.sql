CREATE TABLE "guild_members" (
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"nickname" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_in_guild" boolean DEFAULT true NOT NULL,
	CONSTRAINT "guild_members_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "guild_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"prefix" varchar(10) DEFAULT '!' NOT NULL,
	"locale" varchar(16) DEFAULT 'en-US' NOT NULL,
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"ai_channel_id" varchar(32),
	"log_channel_id" varchar(32),
	"escalation_steps" jsonb,
	"music_channel_id" varchar(32),
	"welcomer_channel_id" varchar(32),
	"welcomer_enabled" boolean DEFAULT false NOT NULL,
	"welcomer_bg" text,
	"farewell_channel_id" varchar(32),
	"farewell_enabled" boolean DEFAULT false NOT NULL,
	"farewell_bg" text,
	"karma_notifications_enabled" boolean DEFAULT true NOT NULL,
	"level_up_channel_id" varchar(32),
	"xp_rate_percent" integer DEFAULT 100 NOT NULL,
	"no_xp_channel_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"no_xp_role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"voice_xp_enabled" boolean DEFAULT false NOT NULL,
	"max_game_wager" integer,
	"tcg_drops_enabled" boolean DEFAULT false NOT NULL,
	"tcg_drop_channel_id" varchar(32),
	"tcg_drop_message_threshold" integer DEFAULT 50 NOT NULL,
	"tcg_drop_start_hour" integer DEFAULT 8 NOT NULL,
	"tcg_drop_end_hour" integer DEFAULT 23 NOT NULL,
	"tcg_drop_claim_timeout_seconds" integer DEFAULT 60 NOT NULL,
	"tcg_drop_cooldown_minutes" integer DEFAULT 5 NOT NULL,
	"tcg_manager_role_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon_url" text,
	"owner_id" varchar(32) NOT NULL,
	"invited_by_id" varchar(32),
	"invited_via" varchar(16),
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"profile_background_url" text,
	"is_blacklisted" boolean DEFAULT false NOT NULL,
	"warn_count" integer DEFAULT 0 NOT NULL,
	"notify_level_up" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "command_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32),
	"command_name" varchar(64) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"cooldown_override" integer,
	"allowed_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocked_roles" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commands" (
	"name" varchar(64) PRIMARY KEY NOT NULL,
	"category" varchar(64) NOT NULL,
	"description" text NOT NULL,
	"slash_enabled" boolean DEFAULT true NOT NULL,
	"prefix_enabled" boolean DEFAULT true NOT NULL,
	"default_permission" varchar(64),
	"cooldown_seconds" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"case_number" integer NOT NULL,
	"type" varchar(32) NOT NULL,
	"target_user_id" varchar(32) NOT NULL,
	"moderator_user_id" varchar(32) NOT NULL,
	"reason" text DEFAULT 'No reason provided' NOT NULL,
	"duration_seconds" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"target_user_id" varchar(32) NOT NULL,
	"author_user_id" varchar(32) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"rule_type" varchar(64) NOT NULL,
	"action" varchar(32) DEFAULT 'WARN' NOT NULL,
	"threshold" integer DEFAULT 3 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"exempt_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exempt_channels" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"moderator_id" varchar(32) NOT NULL,
	"reason" text NOT NULL,
	"severity" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_accounts" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"is_frozen" boolean DEFAULT false NOT NULL,
	"daily_streak" integer DEFAULT 0 NOT NULL,
	"last_daily_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_balances" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"wallet_balance" bigint DEFAULT 0 NOT NULL,
	"bank_balance" bigint DEFAULT 0 NOT NULL,
	"bank_capacity" bigint DEFAULT 10000 NOT NULL,
	"net_worth" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_config" (
	"id" varchar(16) PRIMARY KEY NOT NULL,
	"daily_base_reward" integer DEFAULT 250 NOT NULL,
	"daily_streak_bonus_percent" integer DEFAULT 5 NOT NULL,
	"daily_max_streak_bonus_percent" integer DEFAULT 150 NOT NULL,
	"bank_base_capacity" integer DEFAULT 10000 NOT NULL,
	"bank_capacity_per_level" integer DEFAULT 2500 NOT NULL,
	"updated_by" varchar(64) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_cooldowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"action_type" varchar(64) NOT NULL,
	"last_triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_inventories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_item_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32),
	"name" varchar(64) NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "economy_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"code" varchar(32),
	"name" varchar(64) NOT NULL,
	"description" text NOT NULL,
	"price" bigint NOT NULL,
	"rarity" varchar(32) DEFAULT 'COMMON' NOT NULL,
	"category_id" uuid,
	"icon_url" text,
	"is_purchasable" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "economy_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"base_amount" bigint DEFAULT 100 NOT NULL,
	"multiplier" integer DEFAULT 1 NOT NULL,
	"cooldown_seconds" integer DEFAULT 86400 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"guild_id" varchar(32),
	"type" varchar(32) NOT NULL,
	"amount" bigint NOT NULL,
	"currency" varchar(16) DEFAULT 'CREDITS' NOT NULL,
	"balance_before" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"source" varchar(64) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_snapshots" (
	"user_id" varchar(32) NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"global_rank" integer NOT NULL,
	"server_rank" integer NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_snapshots_user_id_guild_id_pk" PRIMARY KEY("user_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "xp_accounts" (
	"user_id" varchar(32) NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"karma" integer DEFAULT 0 NOT NULL,
	"last_xp_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xp_accounts_user_id_guild_id_pk" PRIMARY KEY("user_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"xp_awarded" integer NOT NULL,
	"source" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_channels" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"last_message_id" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "music_guild_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"default_volume" integer DEFAULT 80 NOT NULL,
	"dj_role_id" varchar(32),
	"restrict_voice_channel_id" varchar(32),
	"auto_leave_empty" boolean DEFAULT true NOT NULL,
	"lyrics_provider" varchar(32) DEFAULT 'GENIUS' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"track_title" text NOT NULL,
	"track_url" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"source_provider" varchar(32) NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_playlist_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playlist_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"duration" integer NOT NULL,
	"thumbnail_url" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_saved_playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"play_count" integer DEFAULT 0 NOT NULL,
	"guild_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_channels" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"channel_id" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"guild_id" varchar(32),
	"channel_id" varchar(32),
	"provider" varchar(32) DEFAULT 'GEMINI' NOT NULL,
	"model" varchar(64) NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_guild_preferences" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"personality_prompt" text,
	"speaking_style" varchar(64) DEFAULT 'FRIENDLY_ANIME' NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tools_enabled" boolean DEFAULT true NOT NULL,
	"provider_override" varchar(16),
	"model_override" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"conversation_id" text NOT NULL,
	"role" varchar(32) NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"token_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_user_preferences" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"nickname" varchar(64),
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"language_preference" varchar(16) DEFAULT 'en' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_guild_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"default_provider" varchar(32),
	"member_daily_limit" integer,
	"default_preset" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "image_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"guild_id" varchar(32),
	"provider_id" varchar(32) NOT NULL,
	"prompt" text NOT NULL,
	"negative_prompt" text,
	"status" varchar(32) DEFAULT 'QUEUED' NOT NULL,
	"result_url" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "image_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"positive_prompt_prefix" text NOT NULL,
	"negative_prompt_preset" text,
	"is_system_preset" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_providers" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_free_tier" boolean DEFAULT false NOT NULL,
	"rate_limit_per_min" integer DEFAULT 10 NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_usage" (
	"user_id" varchar(32) NOT NULL,
	"provider_id" varchar(32) NOT NULL,
	"images_generated_today" integer DEFAULT 0 NOT NULL,
	"last_reset_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_usage_user_id_provider_id_pk" PRIMARY KEY("user_id","provider_id")
);
--> statement-breakpoint
CREATE TABLE "giveaway_entries" (
	"giveaway_id" uuid NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"bonus_multiplier" integer DEFAULT 1 NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "giveaway_entries_giveaway_id_user_id_pk" PRIMARY KEY("giveaway_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "giveaway_winners" (
	"giveaway_id" uuid NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"won_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_reroll" boolean DEFAULT false NOT NULL,
	CONSTRAINT "giveaway_winners_giveaway_id_user_id_pk" PRIMARY KEY("giveaway_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "giveaways" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_id" varchar(32) NOT NULL,
	"prize" text NOT NULL,
	"winner_count" integer DEFAULT 1 NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_ended" boolean DEFAULT false NOT NULL,
	"requirements" jsonb DEFAULT '{}'::jsonb,
	"created_by" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_id" varchar(32) NOT NULL,
	"announced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_announcements_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "stream_assets" (
	"stream_id" varchar(64) PRIMARY KEY NOT NULL,
	"original_url" text NOT NULL,
	"discord_attachment_url" text NOT NULL,
	"file_hash" varchar(64) NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"streamer_id" uuid NOT NULL,
	"stream_id" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"game_name" varchar(128),
	"viewer_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stream_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"streamer_id" uuid NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"custom_message" text,
	"mention_role_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streamers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(32) NOT NULL,
	"platform_user_id" varchar(64) NOT NULL,
	"username" varchar(64) NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"is_live" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "free_game_announcements" (
	"game_id" varchar(64) NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_id" varchar(32) NOT NULL,
	"announced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "free_game_announcements_game_id_guild_id_pk" PRIMARY KEY("game_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "free_game_channels" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"mention_role_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "free_games" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"store_url" text NOT NULL,
	"thumbnail_url" text,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boss_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boss_id" uuid NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"damage_dealt" bigint NOT NULL,
	"cards_used" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"total_hp" bigint NOT NULL,
	"current_hp" bigint NOT NULL,
	"element" varchar(32) NOT NULL,
	"rewards_table" jsonb DEFAULT '{}'::jsonb,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_user_id" varchar(32) NOT NULL,
	"receiver_user_id" varchar(32) NOT NULL,
	"offered_card_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_card_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"offered_credits" bigint DEFAULT 0 NOT NULL,
	"requested_credits" bigint DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dungeon_bosses" (
	"id" varchar(96) PRIMARY KEY NOT NULL,
	"season_id" varchar(32) NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"anime_title" text NOT NULL,
	"element" varchar(16) NOT NULL,
	"tier" varchar(16) DEFAULT 'STANDARD' NOT NULL,
	"title" text,
	"flavor_text" text,
	"asset_id" text,
	"anilist_id" integer,
	"danbooru_tag" text,
	"image_path" text,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"signature_drop_code" varchar(64),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dungeon_floors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" varchar(32) NOT NULL,
	"floor_number" integer NOT NULL,
	"name" text NOT NULL,
	"energy_cost" integer DEFAULT 10 NOT NULL,
	"min_player_level" integer DEFAULT 1 NOT NULL,
	"enemy_lineup" jsonb NOT NULL,
	"floor_affixes" jsonb DEFAULT '[]'::jsonb,
	"is_boss_floor" boolean DEFAULT false NOT NULL,
	"first_clear_rewards" jsonb DEFAULT '{}'::jsonb,
	"repeat_rewards_table" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dungeon_seasons" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"theme_element" varchar(32) DEFAULT 'ALL' NOT NULL,
	"seasonal_affixes" jsonb DEFAULT '[]'::jsonb,
	"scaling_model" varchar(32) DEFAULT 'HYBRID' NOT NULL,
	"scaling_params" jsonb DEFAULT '{}'::jsonb,
	"is_tutorial" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" varchar(32) NOT NULL,
	"tier" varchar(32) DEFAULT 'BRONZE' NOT NULL,
	"requirement_type" varchar(64) NOT NULL,
	"requirement_target" integer DEFAULT 1 NOT NULL,
	"reward_xp" integer DEFAULT 0 NOT NULL,
	"reward_credits" bigint DEFAULT 0 NOT NULL,
	"reward_card_id" text,
	"reward_item_id" text,
	"reward_consumables" jsonb DEFAULT '{}'::jsonb,
	"reward_title" text,
	"badge_icon" text,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_achievements_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "game_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"type" varchar(32) NOT NULL,
	"subtype" varchar(32) NOT NULL,
	"rarity" varchar(32) DEFAULT 'COMMON' NOT NULL,
	"base_stats" jsonb DEFAULT '{}'::jsonb,
	"battle_perks" jsonb DEFAULT '[]'::jsonb,
	"consumable_effect" jsonb DEFAULT '{}'::jsonb,
	"is_shop_buyable" boolean DEFAULT true NOT NULL,
	"shop_price" bigint DEFAULT 100 NOT NULL,
	"max_daily_purchases" integer DEFAULT 5 NOT NULL,
	"is_tradeable" boolean DEFAULT true NOT NULL,
	"owner_overridden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "market_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_user_id" varchar(32) NOT NULL,
	"user_card_id" uuid NOT NULL,
	"price" bigint NOT NULL,
	"tax_paid" bigint DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_energy" (
	"user_id" varchar(32) PRIMARY KEY NOT NULL,
	"current_energy" integer DEFAULT 100 NOT NULL,
	"max_energy" integer DEFAULT 100 NOT NULL,
	"bonus_energy" integer DEFAULT 0 NOT NULL,
	"daily_energy_pots_used" integer DEFAULT 0 NOT NULL,
	"last_replenished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reset_date" varchar(16) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"reward_xp" integer DEFAULT 0 NOT NULL,
	"reward_credits" bigint DEFAULT 0 NOT NULL,
	"reward_card_id" text,
	"target_count" integer DEFAULT 1 NOT NULL,
	"type" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tcg_system_configs" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" varchar(32) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"achievement_id" uuid NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"is_unlocked" boolean DEFAULT false NOT NULL,
	"is_claimed" boolean DEFAULT false NOT NULL,
	"unlocked_at" timestamp with time zone,
	"claimed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"card_id" text NOT NULL,
	"serial_number" integer NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"battles_won" integer DEFAULT 0 NOT NULL,
	"state" varchar(32) DEFAULT 'IDLE' NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"obtained_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_dungeon_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"season_id" varchar(32) NOT NULL,
	"highest_cleared_floor" integer DEFAULT 0 NOT NULL,
	"attempts_count" integer DEFAULT 0 NOT NULL,
	"clear_count" integer DEFAULT 0 NOT NULL,
	"first_cleared_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"enhancement_level" integer DEFAULT 0 NOT NULL,
	"equipped_to_card_id" uuid,
	"slot" varchar(32) DEFAULT 'NONE' NOT NULL,
	"state" varchar(32) DEFAULT 'IDLE' NOT NULL,
	"obtained_from" varchar(32) DEFAULT 'SHOP' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waifu_assets" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"source_id" varchar(32) NOT NULL,
	"source_image_id" varchar(64) NOT NULL,
	"character_name" text NOT NULL,
	"anime_title" text NOT NULL,
	"image_hash" varchar(64) NOT NULL,
	"local_storage_path" text,
	"discord_cdn_url" text,
	"is_deleted_by_request" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waifu_assets_image_hash_unique" UNIQUE("image_hash")
);
--> statement-breakpoint
CREATE TABLE "waifu_card_serials" (
	"card_id" text PRIMARY KEY NOT NULL,
	"next_serial" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waifu_cards" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"asset_id" text NOT NULL,
	"name" text NOT NULL,
	"rarity" varchar(32) NOT NULL,
	"element" varchar(32) NOT NULL,
	"attack" integer NOT NULL,
	"defense" integer NOT NULL,
	"speed" integer NOT NULL,
	"health" integer NOT NULL,
	"crit_rate" real DEFAULT 0.05 NOT NULL,
	"skill_name" text,
	"skill_description" text,
	"passive_name" text,
	"passive_description" text,
	"collection_number" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waifu_guild_members" (
	"guild_id" uuid NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"rank" varchar(32) DEFAULT 'MEMBER' NOT NULL,
	"contribution_xp" bigint DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waifu_guild_members_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "waifu_guilds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"leader_user_id" varchar(32) NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"guild_xp" bigint DEFAULT 0 NOT NULL,
	"guild_bank" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waifu_guilds_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "waifu_sources" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"attribution_text" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" varchar(32) NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"host_user_id" varchar(32) NOT NULL,
	"opponent_user_id" varchar(32),
	"wager_amount" bigint DEFAULT 0 NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'WAITING' NOT NULL,
	"winner_user_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_statistics" (
	"user_id" varchar(32) NOT NULL,
	"game_id" varchar(32) NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"total_wagered" bigint DEFAULT 0 NOT NULL,
	"net_profit" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "game_statistics_user_id_game_id_pk" PRIMARY KEY("user_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "mini_games" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"min_players" integer DEFAULT 1 NOT NULL,
	"max_players" integer DEFAULT 2 NOT NULL,
	"allow_wagers" boolean DEFAULT true NOT NULL,
	"cooldown_seconds" integer DEFAULT 10 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adventure_choices" (
	"session_id" text NOT NULL,
	"revision" integer NOT NULL,
	"payload" text NOT NULL,
	CONSTRAINT "adventure_choices_session_id_revision_pk" PRIMARY KEY("session_id","revision")
);
--> statement-breakpoint
CREATE TABLE "adventure_players" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_start_at" bigint DEFAULT 0 NOT NULL,
	"cooldown_until" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adventure_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"revision" integer NOT NULL,
	"delivered_revision" integer DEFAULT -1 NOT NULL,
	"status" text NOT NULL,
	"deadline" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	"payload" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adventure_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"energy_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32),
	"actor_user_id" varchar(32) NOT NULL,
	"action" varchar(64) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"ip_address" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_voice_channels" (
	"channel_id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"parent_channel_id" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_voice_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"parent_channel_id" varchar(32) NOT NULL,
	"channel_name_template" text DEFAULT '{user}''s Room' NOT NULL,
	"user_limit" integer DEFAULT 0 NOT NULL,
	"bitrate" integer DEFAULT 64000 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_auto_roles" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"human_role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bot_role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_role_id" varchar(32),
	"verification_channel_id" varchar(32),
	"verification_message_id" varchar(32),
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_farewell" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_template" text DEFAULT 'Goodbye {user}!' NOT NULL,
	"card_theme" varchar(64) DEFAULT 'DEFAULT' NOT NULL,
	"background_url" text,
	"background_file" text,
	"text_color" varchar(7) DEFAULT '#ffffff' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_welcomer" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_template" text DEFAULT 'Welcome to {server}, {user}!' NOT NULL,
	"card_theme" varchar(64) DEFAULT 'DEFAULT' NOT NULL,
	"background_url" text,
	"background_file" text,
	"text_color" varchar(7) DEFAULT '#ffffff' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reaction_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_id" varchar(32) NOT NULL,
	"emoji_or_component_id" varchar(64) NOT NULL,
	"role_id" varchar(32) NOT NULL,
	"type" varchar(32) DEFAULT 'EMOJI' NOT NULL,
	"mode" varchar(32) DEFAULT 'TOGGLE' NOT NULL,
	"group_id" varchar(64),
	"label" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"guild_id" varchar(32),
	"channel_id" varchar(32) NOT NULL,
	"message" text NOT NULL,
	"trigger_at" timestamp with time zone NOT NULL,
	"repeat_interval" varchar(32) DEFAULT 'NONE' NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temporary_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"role_id" varchar(32) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"assigned_by" varchar(32) NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_known_devices" (
	"user_id" varchar(32) NOT NULL,
	"device_hash" varchar(64) NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "web_known_devices_user_id_device_hash_pk" PRIMARY KEY("user_id","device_hash")
);
--> statement-breakpoint
CREATE TABLE "web_passkeys" (
	"id" varchar(1024) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"name" varchar(64) NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"device_type" varchar(16) NOT NULL,
	"backed_up" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "web_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" varchar(64),
	"user_agent" text,
	"step_up_at" timestamp with time zone,
	"webauthn_challenge" varchar(128),
	"webauthn_challenge_expires_at" timestamp with time zone,
	"discord_access_token" text NOT NULL,
	"discord_refresh_token" text NOT NULL,
	"discord_token_expires_at" timestamp with time zone NOT NULL,
	"dbsc_session_id" varchar(64),
	"dbsc_public_key" text
);
--> statement-breakpoint
CREATE TABLE "guild_config_versions" (
	"guild_id" varchar(32) NOT NULL,
	"module" varchar(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guild_config_versions_guild_id_module_pk" PRIMARY KEY("guild_id","module")
);
--> statement-breakpoint
CREATE TABLE "bot_status" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"gateway_ping_ms" integer,
	"guild_count" integer NOT NULL,
	"version" varchar(32) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "command_usage_daily" (
	"guild_id" varchar(32) NOT NULL,
	"day" varchar(10) NOT NULL,
	"command_name" varchar(64) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "command_usage_daily_guild_id_day_command_name_pk" PRIMARY KEY("guild_id","day","command_name")
);
--> statement-breakpoint
CREATE TABLE "guild_voice_activity" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"channels" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adventure_choices" ADD CONSTRAINT "adventure_choices_session_id_adventure_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "adventure_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pg_command_settings_guild_cmd" ON "command_settings" USING btree ("guild_id","command_name");--> statement-breakpoint
CREATE INDEX "idx_pg_mod_cases_guild_number" ON "moderation_cases" USING btree ("guild_id","case_number");--> statement-breakpoint
CREATE INDEX "idx_pg_mod_cases_target" ON "moderation_cases" USING btree ("guild_id","target_user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_mod_notes_user" ON "moderation_notes" USING btree ("guild_id","target_user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_mod_warnings_user" ON "moderation_warnings" USING btree ("guild_id","user_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_pg_economy_cd_user_action" ON "economy_cooldowns" USING btree ("user_id","action_type");--> statement-breakpoint
CREATE INDEX "idx_pg_economy_inv_user" ON "economy_inventories" USING btree ("user_id","item_id");--> statement-breakpoint
CREATE INDEX "idx_pg_economy_inv_item" ON "economy_inventories" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pg_economy_item_categories_code" ON "economy_item_categories" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pg_economy_items_code" ON "economy_items" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_pg_economy_tx_user_created" ON "economy_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_economy_tx_type" ON "economy_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_pg_leaderboard_server_rank" ON "leaderboard_snapshots" USING btree ("guild_id","server_rank");--> statement-breakpoint
CREATE INDEX "idx_pg_xp_accounts_guild_xp" ON "xp_accounts" USING btree ("guild_id","xp");--> statement-breakpoint
CREATE INDEX "idx_pg_xp_events_user_guild" ON "xp_events" USING btree ("user_id","guild_id");--> statement-breakpoint
CREATE INDEX "idx_pg_music_history_guild_played" ON "music_history" USING btree ("guild_id","played_at");--> statement-breakpoint
CREATE INDEX "idx_pg_music_tracks_playlist" ON "music_playlist_tracks" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE INDEX "idx_pg_music_playlists_user" ON "music_saved_playlists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_ai_conversations_user" ON "ai_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_pg_ai_messages_conv_created" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_image_jobs_user_status" ON "image_jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_pg_image_jobs_user_created" ON "image_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_giveaways_guild_active" ON "giveaways" USING btree ("guild_id","is_ended");--> statement-breakpoint
CREATE INDEX "idx_pg_stream_announcements_key" ON "stream_announcements" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_pg_stream_subs_streamer" ON "stream_subscriptions" USING btree ("streamer_id");--> statement-breakpoint
CREATE INDEX "idx_pg_stream_subs_guild" ON "stream_subscriptions" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_pg_boss_runs_boss" ON "boss_runs" USING btree ("boss_id","performed_at");--> statement-breakpoint
CREATE INDEX "idx_pg_card_trades_users" ON "card_trades" USING btree ("sender_user_id","receiver_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pg_dungeon_bosses_season_key" ON "dungeon_bosses" USING btree ("season_id","key");--> statement-breakpoint
CREATE INDEX "idx_pg_dungeon_floors_season_floor" ON "dungeon_floors" USING btree ("season_id","floor_number");--> statement-breakpoint
CREATE INDEX "idx_pg_market_listings_status" ON "market_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_pg_market_listings_seller" ON "market_listings" USING btree ("seller_user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_user_achievements_user_claimed" ON "user_achievements" USING btree ("user_id","is_claimed");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_cards_serial_unique" ON "user_cards" USING btree ("card_id","serial_number");--> statement-breakpoint
CREATE INDEX "idx_pg_user_cards_user_state" ON "user_cards" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "idx_pg_user_cards_card" ON "user_cards" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pg_user_dungeon_unique" ON "user_dungeon_progress" USING btree ("user_id","season_id");--> statement-breakpoint
CREATE INDEX "idx_pg_user_inv_items_user_state" ON "user_inventory_items" USING btree ("user_id","state");--> statement-breakpoint
CREATE INDEX "idx_pg_waifu_assets_character" ON "waifu_assets" USING btree ("character_name");--> statement-breakpoint
CREATE INDEX "idx_pg_waifu_cards_rarity" ON "waifu_cards" USING btree ("rarity");--> statement-breakpoint
CREATE INDEX "idx_pg_waifu_cards_element" ON "waifu_cards" USING btree ("element");--> statement-breakpoint
CREATE INDEX "idx_pg_game_sessions_guild_status" ON "game_sessions" USING btree ("guild_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_adventure_active_user" ON "adventure_sessions" USING btree ("user_id") WHERE "adventure_sessions"."status" IN ('ACTIVE', 'SETTLING');--> statement-breakpoint
CREATE INDEX "idx_adventure_due" ON "adventure_sessions" USING btree ("status","deadline");--> statement-breakpoint
CREATE INDEX "idx_adventure_user_created" ON "adventure_sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_audit_logs_guild_created" ON "audit_logs" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pg_auto_voice_channels_guild" ON "auto_voice_channels" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_pg_reaction_roles_msg" ON "reaction_roles" USING btree ("message_id","emoji_or_component_id");--> statement-breakpoint
CREATE INDEX "idx_pg_reminders_trigger" ON "reminders" USING btree ("trigger_at","is_completed");--> statement-breakpoint
CREATE INDEX "idx_pg_temporary_roles_expires" ON "temporary_roles" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_pg_web_known_devices_last_seen" ON "web_known_devices" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_pg_web_passkeys_user" ON "web_passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_web_sessions_user" ON "web_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pg_web_sessions_expires" ON "web_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pg_web_sessions_dbsc_session" ON "web_sessions" USING btree ("dbsc_session_id");--> statement-breakpoint
CREATE INDEX "idx_pg_guild_config_versions_updated" ON "guild_config_versions" USING btree ("updated_at");