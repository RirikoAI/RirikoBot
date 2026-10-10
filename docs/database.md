# Database Architecture & Schema Specification (Ririko AI 2.0.0)

## 1. Overview & Dual-Dialect Strategy
Ririko AI 2.0.0 uses **Drizzle ORM** for 100% type-safe SQL queries with zero runtime overhead.
To support both enterprise cloud deployments and zero-configuration local development/self-hosting, Ririko supports a **Dual-Dialect Architecture**:
- **Production**: PostgreSQL (`postgres` driver / `drizzle-orm/node-postgres`) with connection pooling, high concurrency, and native UUID / JSONB support.
- **Development & Self-Hosting**: SQLite (`better-sqlite3` / `drizzle-orm/better-sqlite3`) with WAL mode (`PRAGMA journal_mode = WAL;`) and enforced foreign keys (`PRAGMA foreign_keys = ON;`).

**The schema is migrated at startup (ADR-015).** Nothing creates or upgrades tables except the migration runner, `migrateDatabase`.
- **Bot:** `main.ts` runs `prepareDatabase` (`apps/bot/src/database-startup.ts`) right after it opens the database, before the 1.4.0 upgrade (`runLegacyUpgrade`) and before any service starts.
  - `DB_AUTO_MIGRATE` (default `true`, part of the shared config schema) lets the bot apply the pending migrations. An empty database gets `0000_baseline`; a database from before migration records is adopted once (see below).
  - With `DB_AUTO_MIGRATE=false` the bot calls `migrationStatus` instead and exits with a clear message while migrations are pending. It never starts on an old schema. Run `ririko db:migrate` first.
  - Either way, recorded contract migrations this release does not know stop the bot (the downgrade guard); unknown additive ones only log a warning.
- **CLI:** `ririko db:migrate` applies the same migrations by hand (`docker exec <bot container> ririko db:migrate` in the bot image). `--status` prints the latest, pending and unknown ids; `--dry-run` prints the plan, including what adopting an old database would change, and changes nothing. Exit codes: 0 done or nothing to do, 1 failure, 2 refused by the downgrade guard.
- **Dashboard:** it never changes the schema. `getDatabase` (`apps/web/src/lib/server/services.ts`) calls `migrationStatus` through `assertSchemaCurrent`. While the database is behind (never migrated, tables without records, or pending migrations), the dashboard cannot start: `/api/ready` answers 503 and the server log names the pending migrations; `/api/health` stays 200 and reports `MIGRATION_PENDING`, so the container is not marked unhealthy and restarted while the bot migrates. The next request tries again, so the dashboard recovers by itself once the bot or `ririko db:migrate` has migrated the database. The same downgrade guard applies as in the bot.
- **`db:copy`:** it prepares its PostgreSQL target with `migrateDatabase`, so the target holds the exact tables the bot expects and its own migration records. The migration tracking table of the source is never copied.
- **Tests:** `createDatabaseClient({ autoMigrate: true })` runs `migrateDatabase` right after connecting; it is meant for tests and throwaway databases (`:memory:`), and is off by default. `describeDialects` and the bot test harness migrate the same way. `SQLITE_SCHEMA_DDL` and `PG_SCHEMA_DDL` are only fixtures for the parity and baseline tests now. `createSqliteClient` creates no tables, not even in a new file.
- **Text ids (BUG-0038):** these id columns are `text` in both dialects, because SQLite holds slugs and prefixed ids that PostgreSQL's `uuid` rejects: card ids (`card_fire_001`), asset ids (`asset_card_bulk_fire_001`), item ids (`candy_minor`) and AI ids (`conv_<uuid>`, `msg_<uuid>`).
  - The columns: `waifu_assets.id`, `waifu_cards.id`, `waifu_cards.asset_id`, `user_cards.card_id`, `dungeon_bosses.asset_id`, `game_achievements.reward_card_id` and `reward_item_id`, `quests.reward_card_id`, `economy_items.id`, `economy_inventories.item_id`, `ai_conversations.id`, `ai_messages.id` and `ai_messages.conversation_id`.
  - Ids are never remapped: card images in `public/cards` are named by card id, and the same ids appear in adventure payloads, `tcg_system_configs` and `waifu_card_serials.card_id`.
  - A primary key keeps a random-uuid default, as text (`gen_random_uuid()::text`).
  - `ensureTextIdColumns` upgrades a PostgreSQL database that still has `uuid` there. Adoption of an existing database runs it (see below). It runs under an advisory lock in one transaction, casts each value to its text form and changes nothing on a second run. It does nothing on SQLite. The list is `TEXT_ID_COLUMNS` in `packages/database/src/migrations/text-ids.ts`.
- **The DDL files:** both are generated from the Drizzle schemas and committed. The production images have no `drizzle-kit`.
  - Regenerate them after every schema change with `pnpm -F @ririko/database db:generate-ddl`.
  - The parity tests `schema/sqlite/ddl.test.ts` and `schema/pg/ddl.test.ts` fail when they are stale.
- **Migrations (ADR-015, EPIC-019):** schema changes ship as versioned, forward-only SQL files, one ordered list per dialect, applied by `migrateDatabase` (the bot at startup, `ririko db:migrate`, `db:copy`) and checked by `migrationStatus` (the dashboard).
  - **Files:** `packages/database/migrations/sqlite/` and `packages/database/migrations/pg/`, named `NNNN_<slug>.sql`, each with drizzle-kit's `meta/` snapshots. Commit all of it; the next `generate` diffs against the snapshots.
  - **Baseline:** `0000_baseline.sql` is the schema at adoption time (the same tables, columns, defaults and indexes as the DDL files). PostgreSQL migrations use unqualified names, so they build the connection's `search_path`.
  - **Authoring flow:** change the Drizzle schema in `packages/database/src/schema/`, then run `pnpm db:generate`.
    - It runs `drizzle-kit generate` for both dialects (`drizzle.sqlite.config.ts`, `drizzle.pg.config.ts`), then `db:generate-migrations` (the embedder), then `db:generate-ddl`.
    - To name the migration, run `pnpm -F @ririko/database db:generate-sql --name <slug>` first, then `pnpm db:generate`.
    - Review the SQL before committing. A migration may be edited before release, for example to add a backfill; after a release it never changes.
    - `drizzle.config.ts` stays the development config for `db:push`. `db:push` never runs on staging or production.
  - **Embedding:** `db:generate-migrations` (`scripts/embed-migrations.mjs`) writes `packages/database/src/migrations/generated/sqlite.ts` (`SQLITE_MIGRATIONS`) and `pg.ts` (`PG_MIGRATIONS`). Each entry is `{ id, statements, checksum, contract }` (`EmbeddedMigration`):
    - `statements`: the file split on drizzle's `--> statement-breakpoint`, never on `;`;
    - `checksum`: sha256 of the file bytes with CRLF normalised to LF, so Windows and Linux agree;
    - `contract`: true when the first line is `-- ririko:contract`.
  - **CI gate:** `pnpm db:check` (`scripts/check-migrations.ts`, run by the CircleCI `lint` job) fails when `drizzle-kit generate` would still write a migration (it runs on a temporary copy of the folder), when the embedded modules differ from the SQL files, or when a migration has `DROP TABLE`, `DROP COLUMN`, `RENAME`, `ALTER COLUMN ... TYPE` or `SET NOT NULL` without `-- ririko:contract` on its first line. It prints the file and the statement. Destructive changes follow expand/contract: the additive step ships first, the contract migration in a later release.
  - **SQLite table rebuilds:** drizzle-kit writes a column type change or a dropped column on SQLite as `PRAGMA foreign_keys=OFF`, a new table, a copy, `DROP TABLE`, a rename and `PRAGMA foreign_keys=ON`. SQLite ignores that pragma inside a transaction, so the runner treats a migration that contains `PRAGMA foreign_keys=OFF` as SQLite's rebuild procedure: it turns foreign keys off on the connection before `BEGIN`, skips the two pragma statements inside the transaction, requires `PRAGMA foreign_key_check` to return no rows before `COMMIT` (otherwise it rolls back with a `DatabaseError` that names the table), and restores the setting afterwards. `ON DELETE CASCADE` children are therefore kept. PostgreSQL does not need this.
  - The output is deterministic. `migrations/generated.test.ts` fails when the modules are stale, and checks that the baseline builds the same schema as the DDL files (SQLite in memory; PostgreSQL when `TEST_POSTGRES_URL` is set).
  - **Adopting an existing database** (`migrations/adopt-baseline.ts`, called by `migrateDatabase`): a database that has tables but no `ririko_schema_migrations` table (staging, self-hosted 2.0 databases) is not given `0000_baseline` to run. Under the same lock, and after the same SQLite backup:
    - `ensureTextIdColumns` turns PostgreSQL `uuid` id columns into `text`, and the duplicate card serial audit refuses ambiguous serials.
    - The live schema is compared with the baseline. The expected shape comes from a scratch database that runs the baseline (in-memory SQLite; temporary tables in a rolled-back PostgreSQL transaction), and both are read with the same catalog queries, so no SQL is parsed.
    - The repair is additive and runs in one transaction. Missing tables, foreign keys and indexes are created from the baseline statements; a missing column that is nullable or has a default is added; extra tables and columns are only logged.
    - Column types are compared exactly on PostgreSQL (`format_type`). On SQLite they are compared by type affinity ([datatype3 section 3.1](https://sqlite.org/datatype3.html): `INT` gives INTEGER; `CHAR`, `CLOB` or `TEXT` gives TEXT; `BLOB` or no type gives BLOB; `REAL`, `FLOA` or `DOUB` gives REAL; anything else NUMERIC), because the declared text does not change how SQLite stores a value. A different declared type with the same affinity (`BIGINT` for `INTEGER`, as the removed `ensureAdventureSchema` created the adventure tables; `VARCHAR(32)` for `TEXT`) is only reported as a note and left as it is. INTEGER and NUMERIC affinity also count as compatible (a note too): NUMERIC keeps a whole number as INTEGER, so the `BOOLEAN` that `ensureAdventureSchema` gave `adventure_settings.energy_enabled` holds what the baseline's `integer` does. TEXT, BLOB and REAL against INTEGER or NUMERIC are still refused. The columns are not rebuilt.
    - A missing NOT NULL column without a default, a column that cannot be added (primary key, generated, or a non-constant default on SQLite), a differing type (on SQLite, a different affinity), or duplicate serials refuse the adoption with one report of every problem, and nothing is changed. `--dry-run` shows the same plan or report.
    - Then `0000_baseline` is recorded with `adopted = true` and its embedded checksum, and later migrations run as usual. A second run changes nothing.
- **Moving data from SQLite to PostgreSQL:** `ririko db:copy` copies a 2.0 SQLite database into an empty PostgreSQL database in one transaction and verifies row counts and economy totals before it commits. Steps, including stopping writers and copying the image folders into their volumes: [docs/migrations.md section 5](migrations.md).

---

## 2. Complete Schema Catalog (40+ Tables)

As mandated by Section 47 of `BLUEPRINT.md`, the database is divided into cohesive domain table groups:

### 2.1. Core Identity & Discord Guilds
- `users`: Universal Discord user registry (`id` Snowflake PK, `username`, `display_name`, `avatar_url`, `profile_background_url`, `is_blacklisted`, `warn_count`, `notify_level_up`, `created_at`, `updated_at`).
- `guilds`: Discord server registry (`id` Snowflake PK, `name`, `icon_url`, `owner_id`, `invited_by_id` nullable, `invited_via` nullable, `joined_at`, `is_active`, `created_at`, `updated_at`). The bot keeps it current (TASK-1831, `GuildRepository`, `guild-registry.listener.ts`): every ready upserts the cached servers and marks the others inactive, `GuildCreate`, `GuildUpdate` and `GuildDelete` follow, and a server that is only unavailable (an outage) stays active. Rows are never deleted, so servers the bot left stay listed as inactive. `invited_by_id` is the member who added the bot and `invited_via` how that was learned (TASK-1841): `oauth` (the dashboard invite flow, `GuildRepository.recordInvite`; the user who authorized the bot, authoritative, so it replaces an earlier inviter), `audit_log` (the `BotAdd` entry, kept 45 days, needs View Audit Log) or `integration` (the user of the bot's integration in the guild's integrations list, needs Manage Server, used when the audit log names no one). Both stay null when nothing says; an active server's inviter, source and `joined_at` are never overwritten by a later bot upsert, and a server the bot left and joined again starts over.
- `guild_members`: Association table tracking guild membership (`guild_id`, `user_id`, `nickname`, `joined_at`, `roles`, `is_in_guild`).
- `guild_settings`: Unified guild configuration (`guild_id` PK, `prefix`, `locale`, `timezone`, `ai_channel_id`, `log_channel_id`, `music_channel_id`, `welcomer_channel_id`, `welcomer_enabled`, `welcomer_bg`, `farewell_channel_id`, `farewell_enabled`, `farewell_bg`, `karma_notifications_enabled`, `created_at`, `updated_at`).

### 2.2. Commands & Dynamic Module Settings
- `commands`: Machine-readable command registry (`name` PK, `category`, `description`, `slash_enabled`, `prefix_enabled`, `default_permission`, `cooldown_seconds`). The bot replaces it with its registered commands at every startup (hidden and owner-only commands left out) so the dashboard and CLI can list them.
- `command_settings`: Per-guild or per-channel overrides (`id` UUID PK, `guild_id`, `channel_id`, `command_name`, `is_enabled`, `cooldown_override`, `allowed_roles`, `blocked_roles`). A row with a null `channel_id` applies server wide; a channel row replaces it in that channel. `GuildConfigService` replaces a guild's rows together, so the table has no unique key.

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
- `economy_items`: Item shop catalog (`id` text PK, a uuid or a legacy slug, `name`, `description`, `price`, `rarity`, `category_id`, `icon_url`, `is_purchasable`, `metadata`).
- `economy_item_categories`: Item category groupings (`id` UUID PK, `name`, `description`).
- `economy_inventories`: User item inventory bags (`id` UUID PK, `user_id`, `item_id` text, `quantity`, `acquired_at`).

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
- `ai_conversations`: Active conversation session identifiers (`id` text PK, `conv_<uuid>`, `user_id`, `guild_id`, `channel_id`, `provider`, `model`, `summary`, `created_at`, `updated_at`).
- `ai_messages`: Contextual message history with token counts (`id` text PK, `msg_<uuid>`, `conversation_id` text, `role` [SYSTEM, USER, ASSISTANT, TOOL], `content`, `tool_calls` JSON, `token_count`, `created_at`).
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
- `stream_subscriptions`: Guild notification subscriptions (`id` UUID PK, `streamer_id`, `guild_id`, `channel_id`, `custom_message`, `mention_role_id`, `created_at`). At most 25 per guild; `StreamAlertService` (used by `/stream` and the dashboard) lets the repository generate the uuid IDs. The 1.4.0 migration derives UUID v5 IDs from the legacy IDs (`legacyUuid`), so re-runs match.
- `stream_events`: Live broadcast session tracking (`id` UUID PK, `streamer_id`, `stream_id`, `title`, `game_name`, `viewer_count`, `started_at`, `ended_at`).
- `stream_announcements`: Idempotency records guaranteeing exactly-once delivery (`id` UUID PK, `idempotency_key` UNIQUE, `guild_id`, `channel_id`, `message_id`, `announced_at`).
- `stream_assets`: Downloaded and validated thumbnails cached on Discord CDN (`stream_id` PK, `original_url`, `discord_attachment_url`, `file_hash`, `cached_at`).

### 2.11. Free Games Announcer
- `free_games`: Free promotional games registry (`id` String PK, `provider` [EPIC, STEAM, GOG], `title`, `store_url`, `thumbnail_url`, `start_date`, `end_date`).
- `free_game_announcements`: Recorded guild announcements preventing re-announcement (`game_id`, `guild_id`, `channel_id`, `message_id`, `announced_at`).
- `free_game_channels`: Where a guild's announcements go (`guild_id` PK, `channel_id`, `mention_role_id` nullable, `created_at`). The role is the only mention an announcement may ping.

### 2.12. Waifu Trading Card Game & Gamification (Flagship Subsystem)
- `waifu_sources`: Ingestion sources (`id` String PK, `name`, `base_url`, `attribution_text`, `is_active`).
- `waifu_assets`: Ingested & hashed anime character images (`id` text PK, `source_id`, `source_image_id`, `character_name`, `anime_title`, `image_hash` UNIQUE, `local_storage_path`, `discord_cdn_url`, `is_deleted_by_request`, `tags` JSON, `created_at`).
- `waifu_cards`: Collectible card definitions (`id` text PK, `asset_id` text, `name`, `rarity` [COMMON, UNCOMMON, RARE, SUPER_RARE, ULTRA_RARE, SECRET_RARE, SIR, MYTHIC], `element` [FIRE, WATER, EARTH, LIGHTNING, ICE, LIGHT, SHADOW], `attack` Int, `defense` Int, `speed` Int, `health` Int, `crit_rate` Float, `skill_name`, `skill_description`, `passive_name`, `passive_description`, `collection_number` Int, `is_active`).
- `user_cards`: Instances of cards owned by players (`id` UUID PK, `user_id`, `card_id` text, `serial_number` Int, `level` Int, `exp` Int, `state` [IDLE, EQUIPPED, IN_TRADE, IN_MARKET], `obtained_at`).
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
- `guild_welcomer` / `guild_farewell`: Welcome and farewell cards (`guild_id` PK, `channel_id` (empty when not set up), `message_template`, `card_theme`, `background_url`, `background_file`, `text_color`, `is_enabled`). At most one of `background_url` and `background_file` is set; `background_file` names an upload in `storage/welcomer-backgrounds`.
- `audit_logs`: Security and administrative action audit trails (`id` UUID PK, `guild_id`, `actor_user_id`, `action`, `details` JSON, `ip_address`, `user_agent`, `created_at`). `GuildConfigService` writes `guild_config.<module>.update` entries with `details = { source: 'dashboard' | 'cli', changes: [{ field, before, after }] }`.

### 2.15. Web Dashboard (EPIC-011)
`web_sessions`, `web_passkeys`, `web_known_devices`, `guild_config_versions`, `command_usage_daily`, `bot_status` and `guild_voice_activity` exist. The other tables are the groomed design from [docs/dashboard.md](file:///Z:/Projects/ririko-v2-2026/docs/dashboard.md) and [ADR-013](file:///Z:/Projects/ririko-v2-2026/docs/adr/ADR-013-dashboard-sessions-and-credential-theft-defense.md); final names are set when the tickets are implemented.
- `web_sessions` (TASK-1102): Opaque server-side dashboard sessions. The primary key `id` is the SHA-256 hash (hex) of the session cookie; the raw value exists only in the `__Host-ririko_session` cookie. Columns: `user_id`, `created_at`, `last_seen_at`, `expires_at` (12 h absolute), `ip_address`, `user_agent`, `step_up_at`, `discord_access_token` and `discord_refresh_token` (AES-256-GCM ciphertexts in the `v<key version>.<iv>.<tag>.<data>` format, bound to the row as additional authenticated data), and `discord_token_expires_at`. The key version is part of each ciphertext, so there is no separate `key_version` column. Indexes on `user_id` (for "sign out everywhere") and `expires_at` (expiry cleanup). `webauthn_challenge` (`<purpose>:<challenge>`) and `webauthn_challenge_expires_at` hold the pending WebAuthn challenge, cleared by the single update that consumes it (TASK-1171).
- `guild_config_versions` (CHORE-1101): Change feed for settings written outside the bot process. Primary key (`guild_id`, `module`), `version` (incremented on every write), `updated_at` (indexed). The dashboard and CLI bump it in the same transaction as the settings write; the bot's `GuildConfigWatcher` polls recent rows and emits `guild:configChanged`.
- `web_passkeys` (TASK-1171): WebAuthn credentials per user. `id` is the credential ID (base64url); `user_id` (indexed), `name`, `public_key` (COSE, base64url), `counter`, `transports` (JSON), `device_type` (`singleDevice` or `multiDevice`), `backed_up`, `created_at`, `last_used_at`. Only public keys are stored.
- `web_known_devices` (TASK-1172): Browsers each user has signed in from. Primary key (`user_id`, `device_hash`), where `device_hash` is the SHA-256 (hex) of the random `__Host-ririko_device` cookie; `first_seen_at`, `last_seen_at` (indexed). A sign-in whose device is not listed triggers a new-device DM. Rows unseen for a year (the cookie lifetime) are deleted at sign-in.
- `command_usage_daily` (TASK-1131): Command usage counters. Primary key (`guild_id`, `day`, `command_name`), where `day` is the UTC day as `YYYY-MM-DD`; `count`. The bot's `CommandUsageRecorder` buffers counts from the router's `onCommandRun` hook and adds them every 60 seconds with `count = count + excluded.count`; rows older than 90 days are deleted.
- `bot_status` (TASK-1131): One row per bot process (`id = 'bot'`): `gateway_ping_ms` (null before the first heartbeat), `guild_count`, `version`, `started_at`, `updated_at`. Written by `BotStatusReporter` every 30 seconds; a row older than 90 seconds means the bot is offline. The EPIC-012 health probes can reuse it.
- `guild_voice_activity` (TASK-1131): `guild_id` PK, `channels` (JSON list of `{ channelId, members }` for voice channels with at least one member who is not a bot), `updated_at`. Written by `BotStatusReporter` only when a guild's channels change; guilds with no active channel have no row.
- Guild TCG settings on `guild_settings` (TASK-1121): `tcg_drops_enabled` (default false), `tcg_drop_channel_id` (null counts every channel), `tcg_drop_message_threshold` (50), `tcg_drop_start_hour` (8), `tcg_drop_end_hour` (23), `tcg_drop_claim_timeout_seconds` (60), `tcg_drop_cooldown_minutes` (5) and `tcg_manager_role_id`. Edited through the `tcg` module of `GuildConfigService`; `DropManager` reads them through `dropConfigFromSettings`. Existing databases need `pnpm db:push`.

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
