# Database Architecture & Schema Specification (Ririko AI 2.0.0)

## 1. Overview & Dual-Dialect Strategy
Ririko AI 2.0.0 uses **Drizzle ORM** for 100% type-safe SQL queries with zero runtime overhead.
To support both enterprise cloud deployments and zero-configuration local development/self-hosting, Ririko supports a **Dual-Dialect Architecture**:
- **Production**: PostgreSQL (`postgres` driver / `drizzle-orm/node-postgres`) with connection pooling, high concurrency, and native UUID / JSONB support.
- **Development & Self-Hosting**: SQLite (`better-sqlite3` / `drizzle-orm/better-sqlite3`) with WAL mode (`PRAGMA journal_mode = WAL;`) and enforced foreign keys (`PRAGMA foreign_keys = ON;`).

---

## 2. Complete Schema Catalog (40+ Tables)

As mandated by Section 47 of `BLUEPRINT.md`, the database is divided into cohesive domain table groups:

### 2.1. Core Identity & Discord Guilds
- `users`: Universal Discord user registry (`id` Snowflake PK, `username`, `display_name`, `avatar_url`, `profile_background_url`, `is_blacklisted`, `warn_count`, `notify_level_up`, `created_at`, `updated_at`).
- `guilds`: Discord server registry (`id` Snowflake PK, `name`, `icon_url`, `owner_id`, `joined_at`, `is_active`, `created_at`, `updated_at`).
- `guild_members`: Association table tracking guild membership (`guild_id`, `user_id`, `nickname`, `joined_at`, `roles`, `is_in_guild`).
- `guild_settings`: Unified guild configuration (`guild_id` PK, `prefix`, `locale`, `timezone`, `ai_channel_id`, `log_channel_id`, `music_channel_id`, `welcomer_channel_id`, `welcomer_enabled`, `welcomer_bg`, `farewell_channel_id`, `farewell_enabled`, `farewell_bg`, `karma_notifications_enabled`, `created_at`, `updated_at`).

### 2.2. Commands & Dynamic Module Settings
- `commands`: Machine-readable command registry (`name` PK, `category`, `description`, `slash_enabled`, `prefix_enabled`, `default_permission`, `cooldown_seconds`).
- `command_settings`: Per-guild or per-channel overrides (`id` UUID PK, `guild_id`, `channel_id`, `command_name`, `is_enabled`, `cooldown_override`, `allowed_roles`, `blocked_roles`).

### 2.3. Moderation & Safety Engine
- `moderation_cases`: Immutable audit logs of punitive actions (`id` Serial/UUID PK, `guild_id`, `case_number`, `type` [WARN, TIMEOUT, KICK, BAN, SOFTBAN, UNBAN], `target_user_id`, `moderator_user_id`, `reason`, `duration_seconds`, `metadata`, `created_at`).
- `moderation_warnings`: Active and expired warning records (`id` UUID PK, `guild_id`, `user_id`, `moderator_id`, `reason`, `severity`, `is_active`, `expires_at`, `created_at`).
- `moderation_rules`: Configurable auto-mod rule definitions (`id` UUID PK, `guild_id`, `rule_type` [INVITE_SPAM, MENTION_SPAM, SCAM_URL, SUSPICIOUS_DOMAIN, REPEATED_TEXT, ATTACHMENT_SPAM], `action` [DELETE, WARN, TIMEOUT], `threshold`, `is_enabled`, `exempt_roles`, `exempt_channels`).
- `moderation_notes`: Staff notes on users (`id` UUID PK, `guild_id`, `target_user_id`, `author_user_id`, `content`, `created_at`, `updated_at`).

### 2.4. Centralized Transactional Economy & Banking
- `economy_accounts`: Account status records (`user_id` PK, `is_frozen`, `daily_streak`, `last_daily_at`, `created_at`, `updated_at`).
- `economy_balances`: Balances per currency/type (`user_id` PK, `wallet_balance` BigInt, `bank_balance` BigInt, `bank_capacity` BigInt, `net_worth` BigInt, `updated_at`).
- `economy_transactions`: Immutable double-entry financial ledger (`id` UUID PK, `user_id`, `guild_id`, `type` [TRANSFER, DEPOSIT, WITHDRAW, DAILY, GAMBLE, SHOP_BUY, MARKET_FEE, TCG_REWARD], `amount` BigInt, `currency`, `balance_before` BigInt, `balance_after` BigInt, `source`, `metadata` JSON, `created_at`).
- `economy_rewards`: System-wide reward configurations and history (`id` UUID PK, `event_type`, `base_amount`, `multiplier`, `cooldown_seconds`).
- `economy_cooldowns`: Per-user reward rate-limit trackers (`id` UUID PK, `user_id`, `action_type`, `last_triggered_at`, `expires_at`).
- `economy_items`: Item shop catalog (`id` UUID PK, `name`, `description`, `price`, `rarity`, `category_id`, `icon_url`, `is_purchasable`, `metadata`).
- `economy_item_categories`: Item category groupings (`id` UUID PK, `name`, `description`).
- `economy_inventories`: User item inventory bags (`id` UUID PK, `user_id`, `item_id`, `quantity`, `acquired_at`).

### 2.5. Experience, Leveling & Rankings
- `xp_accounts`: User leveling progress (`user_id` PK, `guild_id`, `xp` BigInt, `level` Int, `karma` Int, `last_xp_at`, `created_at`, `updated_at`).
- `xp_events`: Audit trail for XP gain events (`id` UUID PK, `user_id`, `guild_id`, `xp_awarded`, `source` [TEXT, VOICE, QUEST, GAME], `created_at`).
- `leaderboard_snapshots`: Cached ranking snapshots for $O(1)$ global and server rank queries (`user_id`, `guild_id`, `global_rank`, `server_rank`, `calculated_at`).

### 2.6. Music & Audio System
- `music_guild_settings`: Guild audio configuration (`guild_id` PK, `default_volume`, `dj_role_id`, `restrict_voice_channel_id`, `auto_leave_empty`, `lyrics_provider`).
- `music_channels`: Dedicated persistent music channel bindings (`guild_id` PK, `channel_id`, `last_message_id`).
- `music_history`: Audit log of played songs (`id` UUID PK, `guild_id`, `user_id`, `track_title`, `track_url`, `duration_seconds`, `source_provider`, `played_at`).
- `music_saved_playlists`: Custom user and guild playlists (`id` UUID PK, `user_id`, `name`, `description`, `is_public`, `play_count`, `guild_id`, `created_at`).
- `music_playlist_tracks`: Tracks within saved playlists (`id` UUID PK, `playlist_id`, `title`, `url`, `duration`, `thumbnail_url`, `position`).

### 2.7. AI Chatbot & Conversational Context
- `ai_channels`: Dedicated AI channel registrations (`guild_id` PK, `channel_id`).
- `ai_conversations`: Active conversation session identifiers (`id` UUID PK, `user_id`, `guild_id`, `channel_id`, `provider`, `model`, `summary`, `created_at`, `updated_at`).
- `ai_messages`: Contextual message history with token counts (`id` UUID PK, `conversation_id`, `role` [SYSTEM, USER, ASSISTANT, TOOL], `content`, `tool_calls` JSON, `token_count`, `created_at`).
- `ai_guild_preferences`: Guild-specific personality prompt and tone (`guild_id` PK, `personality_prompt`, `speaking_style`, `allowed_tools` JSON, `model_override`).
- `ai_user_preferences`: User personal preferences (`user_id` PK, `nickname`, `timezone`, `language_preference`).

### 2.8. Image Generation & Graphics
- `image_providers`: Configured image generation backends (`id` String PK, `name`, `is_enabled`, `is_free_tier`, `rate_limit_per_min`, `capabilities` JSON).
- `image_jobs`: Concurrency-limited image synthesis job queue (`id` UUID PK, `user_id`, `guild_id`, `provider_id`, `prompt`, `negative_prompt`, `status` [QUEUED, PROCESSING, COMPLETED, FAILED], `result_url`, `error_message`, `created_at`, `completed_at`).
- `image_presets`: Anime and art style presets (`id` UUID PK, `name`, `positive_prompt_prefix`, `negative_prompt_preset`, `is_system_preset`).
- `image_usage`: Daily/monthly user quota tracking (`user_id` PK, `provider_id`, `images_generated_today`, `last_reset_at`).

### 2.9. Giveaways
- `giveaways`: Persistent giveaway records (`id` UUID PK, `guild_id`, `channel_id`, `message_id`, `prize`, `winner_count`, `starts_at`, `ends_at`, `is_ended`, `requirements` JSON, `created_by`).
- `giveaway_entries`: User entries into active giveaways (`giveaway_id`, `user_id`, `bonus_multiplier`, `entered_at`).
- `giveaway_winners`: Recorded winners with roll timestamps (`giveaway_id`, `user_id`, `won_at`, `is_reroll`).

### 2.10. Streamer Platforms (Twitch, YouTube, TikTok)
- `streamers`: Multi-platform creator registry (`id` UUID PK, `platform` [TWITCH, YOUTUBE, TIKTOK, FACEBOOK], `platform_user_id`, `username`, `display_name`, `avatar_url`, `is_live`, `last_checked_at`).
- `stream_subscriptions`: Guild notification subscriptions (`id` UUID PK, `streamer_id`, `guild_id`, `channel_id`, `custom_message`, `mention_role_id`, `created_at`).
- `stream_events`: Live broadcast session tracking (`id` UUID PK, `streamer_id`, `stream_id`, `title`, `game_name`, `viewer_count`, `started_at`, `ended_at`).
- `stream_announcements`: Idempotency records guaranteeing exactly-once delivery (`id` UUID PK, `idempotency_key` UNIQUE, `guild_id`, `channel_id`, `message_id`, `announced_at`).
- `stream_assets`: Downloaded and validated thumbnails cached on Discord CDN (`stream_id` PK, `original_url`, `discord_attachment_url`, `file_hash`, `cached_at`).

### 2.11. Free Games Announcer
- `free_games`: Free promotional games registry (`id` String PK, `provider` [EPIC, STEAM, GOG], `title`, `store_url`, `thumbnail_url`, `start_date`, `end_date`).
- `free_game_announcements`: Recorded guild announcements preventing re-announcement (`game_id`, `guild_id`, `channel_id`, `message_id`, `announced_at`).

### 2.12. Waifu Trading Card Game & Gamification (Flagship Subsystem)
- `waifu_sources`: Ingestion sources (`id` String PK, `name`, `base_url`, `attribution_text`, `is_active`).
- `waifu_assets`: Ingested & hashed anime character images (`id` UUID PK, `source_id`, `source_image_id`, `character_name`, `anime_title`, `image_hash` UNIQUE, `local_storage_path`, `discord_cdn_url`, `is_deleted_by_request`, `tags` JSON, `created_at`).
- `waifu_cards`: Collectible card definitions (`id` UUID PK, `asset_id`, `name`, `rarity` [COMMON, UNCOMMON, RARE, SUPER_RARE, ULTRA_RARE, SECRET_RARE, SIR, MYTHIC], `element` [FIRE, WATER, EARTH, LIGHTNING, ICE, LIGHT, SHADOW], `attack` Int, `defense` Int, `speed` Int, `health` Int, `crit_rate` Float, `skill_name`, `skill_description`, `passive_name`, `passive_description`, `collection_number` Int, `is_active`).
- `user_cards`: Instances of cards owned by players (`id` UUID PK, `user_id`, `card_id`, `serial_number` Int, `level` Int, `exp` Int, `state` [IDLE, EQUIPPED, IN_TRADE, IN_MARKET], `obtained_at`).
- `game_items`: Master catalog of equipments, accessories, and consumables (`id` UUID PK, `code` UNIQUE, `name`, `description`, `type` [EQUIPMENT, ACCESSORY, CONSUMABLE], `subtype` [WEAPON, ARMOR, RELIC, RING, AMULET, TALISMAN, HP_POTION, MANA_POTION, ENERGY_RESTORE], `rarity` [COMMON, UNCOMMON, RARE, SUPER_RARE, ULTRA_RARE, SECRET_RARE, SIR, MYTHIC], `base_stats` JSON, `battle_perks` JSON, `consumable_effect` JSON, `is_shop_buyable` Boolean, `shop_price` BigInt, `max_daily_purchases` Int, `is_tradeable` Boolean, `created_at`).
- `user_inventory_items`: Item instances owned by players (`id` UUID PK, `user_id`, `item_id`, `quantity` Int, `enhancement_level` Int, `equipped_to_card_id` UUID Nullable, `slot` [WEAPON, ARMOR, RELIC, RING, AMULET, TALISMAN, NONE], `state` [IDLE, EQUIPPED, IN_TRADE, IN_MARKET], `obtained_from` [SHOP, BATTLE, DUNGEON, BOSS, QUEST, ACHIEVEMENT, TRADE], `created_at`, `updated_at`).
- `player_energy`: Player stamina pool & lifecycle (`user_id` Snowflake PK, `current_energy` Int, `max_energy` Int, `bonus_energy` Int, `daily_energy_pots_used` Int, `last_replenished_at` Timestamp, `last_reset_date` Date, `updated_at` Timestamp).
- `game_achievements`: Master achievement specifications (`id` UUID PK, `code` UNIQUE, `title`, `description`, `category` [COLLECTOR, COMBATANT, TYCOON, BLACKSMITH, DEVOTION, GUILD_HERO], `tier` [BRONZE, SILVER, GOLD, PLATINUM, MYTHIC], `requirement_type` String, `requirement_target` Int, `reward_xp` Int, `reward_credits` BigInt, `reward_card_id` UUID Nullable, `reward_item_id` UUID Nullable, `reward_consumables` JSON, `reward_title` String, `badge_icon` String, `is_hidden` Boolean, `created_at`).
- `user_achievements`: User progress and unlock claims (`id` UUID PK, `user_id`, `achievement_id`, `progress` Int, `is_unlocked` Boolean, `is_claimed` Boolean, `unlocked_at` Timestamp, `claimed_at` Timestamp).
- `dungeon_seasons`: Seasonal dungeon instances (`id` String PK [e.g. 'TUTORIAL', 'S1', 'S2', 'S3'], `name`, `description`, `theme_element` [FIRE, WATER, EARTH, LIGHTNING, ICE, LIGHT, SHADOW, ALL], `seasonal_affixes` JSON, `scaling_model` [LINEAR, POLYNOMIAL, EXPONENTIAL, HYBRID], `scaling_params` JSON, `is_tutorial` Boolean, `is_active` Boolean, `starts_at` Timestamp, `ends_at` Timestamp, `created_at` Timestamp).
- `dungeon_floors`: Floor stages within a season (`id` UUID PK, `season_id` String FK references `dungeon_seasons(id)`, `floor_number` Int, `name`, `energy_cost` Int, `min_player_level` Int, `enemy_lineup` JSON, `floor_affixes` JSON, `is_boss_floor` Boolean, `first_clear_rewards` JSON, `repeat_rewards_table` JSON, `created_at` Timestamp).
- `dungeon_bosses`: Seasonal anime-character bosses synced by `pnpm tcg:boss-builder` (`id` String PK `<season_id>:<key>`, `season_id` String FK references `dungeon_seasons(id)`, `key`, `name`, `anime_title`, `element`, `tier` [STANDARD, MINI_BOSS, MAJOR_BOSS], `title` Nullable, `flavor_text` Nullable, `asset_id` FK references `waifu_assets(id)` Nullable, `anilist_id` Int Nullable, `danbooru_tag` Nullable, `image_path` Nullable, `definition` JSON [combat overrides validated by `bossDefinitionSchema`: stats or statMultipliers, skill, enrage, wardLayers, maxTurns], `signature_drop_code` Nullable, `is_active` Boolean, `created_at`, `updated_at`, UNIQUE(`season_id`, `key`)). Floors reference bosses through `dungeon_floors.enemy_lineup = [{ bossId, overrides? }]`; season difficulty lives in `dungeon_seasons.scaling_params` (`seasonCurveSchema`: baseStats, growth parameters, boss multipliers, enrage, affixStartFloor). Precedence: floor overrides > boss definition > season curve > code defaults.
- `user_dungeon_progress`: Player clearance records per season (`id` UUID PK, `user_id` Snowflake FK references `users(id)`, `season_id` String FK references `dungeon_seasons(id)`, `highest_cleared_floor` Int, `attempts_count` Int, `clear_count` Int, `first_cleared_at` Timestamp Nullable, `last_attempt_at` Timestamp, `created_at` Timestamp, `updated_at` Timestamp, UNIQUE(`user_id`, `season_id`)).
- `tcg_system_configs`: Administrative gameplay parameters (`key` String PK, `value` JSON, `updated_by` Snowflake, `updated_at` Timestamp).
- `card_trades`: Atomic P2P two-party trade proposals (`id` UUID PK, `sender_user_id`, `receiver_user_id`, `offered_card_ids` JSON, `requested_card_ids` JSON, `offered_credits` BigInt, `requested_credits` BigInt, `status` [PENDING, ACCEPTED, REJECTED, CANCELLED], `created_at`, `resolved_at`).
- `market_listings`: Community player marketplace listings (`id` UUID PK, `seller_user_id`, `user_card_id`, `price` BigInt, `tax_paid` BigInt, `status` [ACTIVE, SOLD, CANCELLED, EXPIRED], `created_at`, `expires_at`).
- `waifu_guilds`: In-game player guilds (`id` UUID PK, `name` UNIQUE, `leader_user_id`, `level` Int, `guild_xp` BigInt, `guild_bank` BigInt, `created_at`).
- `waifu_guild_members`: Members of Waifu Guilds (`guild_id`, `user_id`, `rank` [LEADER, OFFICER, MEMBER], `contribution_xp` BigInt, `joined_at`).
- `quests`: Daily and weekly quest templates (`id` UUID PK, `title`, `description`, `reward_xp` Int, `reward_credits` BigInt, `reward_card_id`, `target_count` Int, `type`).
- `bosses`: Server and guild cooperative raid bosses (`id` UUID PK, `name`, `total_hp` BigInt, `current_hp` BigInt, `element`, `rewards_table` JSON, `starts_at`, `ends_at`).
- `boss_runs`: Player attacks on raid bosses (`id` UUID PK, `boss_id`, `user_id`, `damage_dealt` BigInt, `cards_used` JSON, `performed_at`).

### 2.13. Interactive Mini-Games
- `mini_games`: Registered games catalog (`id` String PK, `name`, `min_players`, `max_players`, `allow_wagers`, `cooldown_seconds`).
- `game_sessions`: Active game state instances (`id` UUID PK, `game_id`, `guild_id`, `channel_id`, `host_user_id`, `opponent_user_id`, `wager_amount` BigInt, `state` JSON, `status` [WAITING, IN_PROGRESS, COMPLETED, TIMED_OUT], `winner_user_id`, `created_at`).
- `game_statistics`: Per-user game statistics (`user_id`, `game_id`, `wins` Int, `losses` Int, `ties` Int, `total_wagered` BigInt, `net_profit` BigInt).\

### 2.14. Server Utilities & Scheduled Reminders
- `reaction_roles`: Message-to-role bindings (`id` UUID PK, `guild_id`, `channel_id`, `message_id`, `emoji_or_component_id`, `role_id`).
- `auto_voice_configs`: Auto voice channel generators (`id` UUID PK, `guild_id`, `parent_channel_id`, `channel_name_template`, `user_limit`, `bitrate`).
- `reminders`: Persistent reminder scheduler (`id` UUID PK, `user_id`, `guild_id`, `channel_id`, `message`, `trigger_at`, `repeat_interval` [NONE, DAILY, WEEKLY], `is_completed`).
- `welcome_configs`: Welcomer customization settings (`guild_id` PK, `channel_id`, `message_template`, `card_theme`, `is_enabled`).
- `farewell_configs`: Farewell customization settings (`guild_id` PK, `channel_id`, `message_template`, `card_theme`, `is_enabled`).
- `audit_logs`: Security and administrative action audit trails (`id` UUID PK, `guild_id`, `actor_user_id`, `action`, `details` JSON, `ip_address`, `created_at`).

### 2.15. Web Dashboard (EPIC-011)
`web_sessions` and `guild_config_versions` exist. The other tables are the groomed design from [docs/dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) and [ADR-013](file:///Z:/Projects/ririko-v2-2026/docs/adr/ADR-013-dashboard-sessions-and-credential-theft-defense.md); final names are set when the tickets are implemented.
- `web_sessions` (TASK-1102): Opaque server-side dashboard sessions. The primary key `id` is the SHA-256 hash (hex) of the session cookie; the raw value exists only in the `__Host-ririko_session` cookie. Columns: `user_id`, `created_at`, `last_seen_at`, `expires_at` (12 h absolute), `ip_address`, `user_agent`, `step_up_at`, `discord_access_token` and `discord_refresh_token` (AES-256-GCM ciphertexts in the `v<key version>.<iv>.<tag>.<data>` format, bound to the row as additional authenticated data), and `discord_token_expires_at`. The key version is part of each ciphertext, so there is no separate `key_version` column. Indexes on `user_id` (for "sign out everywhere") and `expires_at` (expiry cleanup).
- `guild_config_versions` (CHORE-1101): Change feed for settings written outside the bot process. Primary key (`guild_id`, `module`), `version` (incremented on every write), `updated_at` (indexed). The dashboard and CLI bump it in the same transaction as the settings write; the bot's `GuildConfigWatcher` polls recent rows and emits `guild:configChanged`.
- `web_passkeys` (TASK-1171): WebAuthn credentials per user (credential ID, public key, signature counter, transports, `created_at`, `last_used_at`).
- `command_usage_daily` (TASK-1131): Command usage counters (`guild_id`, `command_name`, `day`, `count`), incremented by the command router after dispatch. Unique on (`guild_id`, `command_name`, `day`).
- Bot status record (TASK-1131): Gateway ping, guild count and uptime, refreshed by the bot on a fixed interval for the dashboard Overview tab and reusable by the EPIC-012 health probes.
- Guild TCG drop settings (TASK-1121): `DropManager` currently keeps `GuildDropConfig` in memory only, so drop settings need a persisted home before the dashboard can edit them.

---

## 3. Indexing & Transaction Integrity Rules
1. **Foreign Key Enforcement**: In SQLite, every connection explicitly executes `PRAGMA foreign_keys = ON;`.\
2. **ACID Transactions**: Balances, card trading, market purchases, equipment enhancements, and giveaway completions are strictly executed within Drizzle transactions (`db.transaction(...)`).
3. **Compound Indexes**: Essential for high query throughput:
   - `moderation_cases(guild_id, case_number)`
   - `economy_transactions(user_id, created_at DESC)`
   - `ai_messages(conversation_id, created_at ASC)`
   - `stream_announcements(idempotency_key)`
   - `user_cards(user_id, state)`
   - `user_inventory_items(user_id, state)`
   - `user_achievements(user_id, is_claimed)`
   - `game_items(type, rarity)`
   - `dungeon_floors(season_id, floor_number)`
   - `user_dungeon_progress(user_id, season_id)`
