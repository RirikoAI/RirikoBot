# Database Guide

This guide describes the Ririko database: the two kinds of database it supports, how the schema is created and changed, and every table.

## 1. How the Schema Is Managed

### 1.1. Two Kinds of Database

Ririko uses **Drizzle ORM** for type-safe SQL queries. It supports two databases:

- **PostgreSQL** for production. It uses the `pg` driver (`drizzle-orm/node-postgres`) with connection pooling, native UUID and JSONB.
- **SQLite** for development and small self-hosted setups. It uses `better-sqlite3` (`drizzle-orm/better-sqlite3`) with WAL mode (`PRAGMA journal_mode = WAL;`) and enforced foreign keys (`PRAGMA foreign_keys = ON;`).

Set the kind with `DATABASE_DIALECT` (`sqlite` or `postgres`) and the address with `DATABASE_URL`.

### 1.2. Who Changes the Schema

Only the migration runner, `migrateDatabase`, creates or changes tables.

- **The bot.** `main.ts` runs `prepareDatabase` (`apps/bot/src/database-startup.ts`) right after it opens the database. This happens before the 1.4.0 upgrade and before any service starts.
  - With `DB_AUTO_MIGRATE=true` (the default) the bot applies the pending migrations. An empty database gets `0000_baseline`. A database that has tables but no migration records is adopted once (section 1.6).
  - With `DB_AUTO_MIGRATE=false` the bot only checks. It exits with a message that names the pending migrations. It never starts on an old schema. Run `ririko db:migrate` first.
  - In both modes, a database that holds a contract migration this release does not know stops the bot. This is the downgrade guard. Additive migrations that the release does not know only produce a warning.
- **The command-line tool.** `ririko db:migrate` applies the same migrations by hand. In the bot image, run `docker exec <bot container> ririko db:migrate`.
  - `--status` prints the latest, pending and unknown migration ids.
  - `--dry-run` prints the plan, including what adopting an old database would change. It changes nothing.
  - Exit codes: `0` done or nothing to do, `1` failure, `2` refused by the downgrade guard.
- **The dashboard.** It never changes the schema. It checks the schema through `assertSchemaCurrent` in `apps/web/src/lib/server/services.ts`.
  - While the database is behind (never migrated, tables without records, or pending migrations), the dashboard cannot start. `/api/ready` answers `503`, and the server log names the pending migrations.
  - `/api/health` stays `200` and reports `MIGRATION_PENDING`. So Docker does not restart the dashboard while the bot migrates.
  - The next request tries again. The dashboard recovers by itself when the bot or `ririko db:migrate` has migrated the database. The same downgrade guard applies.
- **`ririko db:copy`.** It prepares its PostgreSQL target with `migrateDatabase`. The target gets the exact tables the bot expects and its own migration records. The migration records of the source are never copied.
- **Tests.** `createDatabaseClient({ autoMigrate: true })` runs `migrateDatabase` after it connects. It is for tests and throwaway databases (`:memory:`) and is off by default. `describeDialects` and the bot test harness migrate the same way. `createSqliteClient` creates no tables, not even in a new file.

`pnpm db:push` is a shortcut for development. It never runs against a staging or production database.

### 1.3. Change the Schema

Follow these steps when you change a table.

1. Change the Drizzle schema in `packages/database/src/schema/`.
2. Optional: choose the name of the migration. Without this step, drizzle-kit picks a name:

   ```bash
   pnpm -F @ririko/database db:generate-sql --name <slug>
   ```

3. Generate the migration files for both dialects:

   ```bash
   pnpm db:generate
   ```

   This runs `drizzle-kit generate` for both dialects (`drizzle.sqlite.config.ts` and `drizzle.pg.config.ts`), then `db:generate-migrations` (the embedder), then `db:generate-ddl`.

4. Read the new SQL in `packages/database/migrations/`. You may edit a migration before its release, for example to add a data backfill. After the release, a migration never changes.
5. Run the check that CI runs:

   ```bash
   pnpm db:check
   ```

   It prints no problem when the schema, the migration files and the embedded modules agree.

6. Commit all the output: `packages/database/migrations/`, the embedded modules and the DDL files.

A change that removes or rewrites something (`DROP TABLE`, `DROP COLUMN`, `RENAME`, `ALTER COLUMN ... TYPE`, `SET NOT NULL`) follows the expand and contract rule:

1. Ship the additive step first. The old release must still run on the new schema.
2. Ship the removing step in a later release, in a migration whose first line is `-- ririko:contract`. Do this only when no release uses the old shape.

### 1.4. Migration Files

- **Files.** `packages/database/migrations/sqlite/` and `packages/database/migrations/pg/` hold one ordered list for each dialect. The files are named `NNNN_<slug>.sql`. Each folder also has the drizzle-kit `meta/` snapshots. The next `generate` compares against the snapshots, so commit them.
- **Baseline.** `0000_baseline.sql` is the schema as it was when migrations began. PostgreSQL migrations use unqualified table names, so they build in the `search_path` of the connection.
- **Embedded modules.** `db:generate-migrations` (`scripts/embed-migrations.mjs`) writes `packages/database/src/migrations/generated/sqlite.ts` (`SQLITE_MIGRATIONS`) and `pg.ts` (`PG_MIGRATIONS`). The production images have no `drizzle-kit`, so the runner reads these modules. Each entry is `{ id, statements, checksum, contract }`:
  - `statements`: the file split at the drizzle marker `--> statement-breakpoint`, never at `;`;
  - `checksum`: the sha256 of the file with CRLF changed to LF, so Windows and Linux agree;
  - `contract`: `true` when the first line is `-- ririko:contract`.
- **DDL files.** `pnpm -F @ririko/database db:generate-ddl` generates the bootstrap DDL (`SQLITE_SCHEMA_DDL` and `PG_SCHEMA_DDL`) from the Drizzle schemas. They are fixtures for the parity and baseline tests. The tests `schema/sqlite/ddl.test.ts` and `schema/pg/ddl.test.ts` fail when they are old.
- **Determinism.** The output is the same every time. `migrations/generated.test.ts` fails when the embedded modules are old. It also checks that the baseline builds the same schema as the DDL files (SQLite in memory, PostgreSQL when `TEST_POSTGRES_URL` is set).
- **CI check.** `pnpm db:check` (`scripts/check-migrations.ts`, run by the CircleCI `lint` job) fails and prints the file and the statement when:
  - `drizzle-kit generate` would still write a migration (it runs on a temporary copy of the folder);
  - the embedded modules differ from the SQL files;
  - a migration has `DROP TABLE`, `DROP COLUMN`, `RENAME`, `ALTER COLUMN ... TYPE` or `SET NOT NULL` without `-- ririko:contract` on its first line.
- **Transactions.** Each migration runs in one transaction. On PostgreSQL an advisory lock keeps two processes from migrating at the same time.

### 1.5. SQLite Table Rebuilds

For a changed column type or a dropped column, drizzle-kit writes a rebuild for SQLite: `PRAGMA foreign_keys=OFF`, a new table, a copy, `DROP TABLE`, a rename and `PRAGMA foreign_keys=ON`. SQLite ignores that pragma inside a transaction. So the runner treats a migration that contains `PRAGMA foreign_keys=OFF` as a rebuild:

1. It turns foreign keys off on the connection before `BEGIN`.
2. It skips the two pragma statements inside the transaction.
3. It requires `PRAGMA foreign_key_check` to return no rows before `COMMIT`. If rows come back, it rolls back with a `DatabaseError` that names the table.
4. It restores the setting afterwards.

Children with `ON DELETE CASCADE` therefore stay. PostgreSQL does not need this.

### 1.6. Adopt an Existing Database

A database that has tables but no `ririko_schema_migrations` table is not given `0000_baseline` to run. It is adopted (`migrations/adopt-baseline.ts`, called by `migrateDatabase`). On SQLite the runner first makes a backup. Then, under the same lock:

1. `ensureTextIdColumns` changes the PostgreSQL `uuid` id columns of section 1.7 to `text`. The audit of duplicate card serials refuses serials that are not unique.
2. The runner compares the live schema with the baseline. The expected shape comes from a scratch database that runs the baseline (SQLite in memory, or temporary tables in a PostgreSQL transaction that rolls back). Both are read with the same catalog queries, so no SQL is parsed.
3. The repair only adds, in one transaction:
   - It creates missing tables, foreign keys and indexes from the baseline statements.
   - It adds a missing column that is nullable or has a default.
   - Extra tables and columns are only logged.
4. PostgreSQL compares column types exactly (`format_type`). SQLite compares them by type affinity ([SQLite datatype rules, section 3.1](https://sqlite.org/datatype3.html)), because the declared text does not change how SQLite stores a value. A different declared type with the same affinity (for example `BIGINT` for `INTEGER`) is only reported as a note. INTEGER and NUMERIC affinity also count as compatible. TEXT, BLOB and REAL against INTEGER or NUMERIC are refused. The runner does not rebuild columns.
5. The adoption is refused, with one report of every problem and no change, when:
   - a NOT NULL column without a default is missing;
   - a column cannot be added (a primary key, a generated column, or a non-constant default on SQLite);
   - a column type differs (on SQLite, a different affinity);
   - card serials are duplicated.

   `--dry-run` shows the same plan or report.

6. Then the runner records `0000_baseline` with `adopted = true` and its embedded checksum. Later migrations run as usual. A second run changes nothing.

### 1.7. Text Ids

These id columns are `text` in both dialects, because SQLite holds slugs and prefixed ids that the PostgreSQL `uuid` type rejects: card ids (`card_fire_001`), asset ids (`asset_card_bulk_fire_001`), item ids (`candy_minor`) and AI ids (`conv_<uuid>`, `msg_<uuid>`).

- **The columns:** `waifu_assets.id`, `waifu_cards.id`, `waifu_cards.asset_id`, `user_cards.card_id`, `dungeon_bosses.asset_id`, `game_achievements.reward_card_id` and `reward_item_id`, `quests.reward_card_id`, `economy_items.id`, `economy_inventories.item_id`, `ai_conversations.id`, `ai_messages.id` and `ai_messages.conversation_id`.
- **No remapping.** Ids never change. The card images in `public/cards` are named by card id, and the same ids appear in adventure payloads, `tcg_system_configs` and `waifu_card_serials.card_id`.
- **Defaults.** A primary key keeps a random-uuid default, stored as text (`gen_random_uuid()::text`).
- **Old PostgreSQL databases.** `ensureTextIdColumns` changes `uuid` columns to `text`. Adoption runs it. It runs under an advisory lock in one transaction, casts each value to its text form, and changes nothing on a second run. It does nothing on SQLite. The list of columns is `TEXT_ID_COLUMNS` in `packages/database/src/migrations/text-ids.ts`.

### 1.8. Move Data Between Databases

- To move a 2.0 SQLite database into an empty PostgreSQL database, use `ririko db:copy`. [migrations.md section 5](migrations.md#5-move-a-20-sqlite-database-to-postgresql) has the steps.
- To move a 1.4.0 database into 2.0, see [migrations.md](migrations.md).

---

## 2. Table Catalog

The tables are grouped by area.

### 2.1. Core Identity & Discord Guilds
- `users`: Universal Discord user registry (`id` Snowflake PK, `username`, `display_name`, `avatar_url`, `profile_background_url`, `is_blacklisted`, `warn_count`, `notify_level_up`, `created_at`, `updated_at`).
- `guilds`: Discord server registry (`id` Snowflake PK, `name`, `icon_url`, `owner_id`, `invited_by_id` nullable, `invited_via` nullable, `joined_at`, `is_active`, `left_at` nullable, `created_at`, `updated_at`). The bot keeps it current (`GuildRepository`, `guild-registry.listener.ts`). On every ready event it saves the cached servers and marks the others inactive. The events `GuildCreate`, `GuildUpdate` and `GuildDelete` follow. A server that is only unavailable (an outage) stays active. A server the bot left stays listed as inactive, with `left_at` set to the time it left, until the retention purge deletes it with the rest of the server's data (section 4.1). Adding the bot back clears `left_at`. `invited_by_id` is the member who added the bot. `invited_via` says how the bot learned that:
  - `oauth`: the dashboard invite flow (`GuildRepository.recordInvite`). The user who authorized the bot is the answer, so it replaces an earlier inviter.
  - `audit_log`: the `BotAdd` entry, which Discord keeps for 45 days. It needs View Audit Log.
  - `integration`: the user of the bot's integration in the integrations list of the server. It needs Manage Server. The bot uses it when the audit log names no one.

  Both columns stay null when nothing says. A later bot update never overwrites the inviter, the source or `joined_at` of an active server. A server that the bot left and joined again starts over.
- `user_consents`: Which notice or consent a user accepted (`user_id`, `kind` [`terms`, `ai`], `version`, `accepted_at`). Primary key (`user_id`, `kind`), no foreign key. `version` is the date of the legal texts in force when the user accepted (`TERMS_VERSION`, `AI_CONSENT_VERSION` in `ConsentService`); a newer version is accepted again and replaces the row, and a withdrawn consent deletes it. The bot writes a `terms` row after it shows the one-time notice that follows a user's first command (`TERMS_URL` and `PRIVACY_URL` choose the pages it links to).
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
- `leaderboard_snapshots`: Cached ranking snapshots for fast global and server rank queries (`user_id`, `guild_id`, `global_rank`, `server_rank`, `calculated_at`).

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
- `game_statistics`: Per-user game statistics (`user_id`, `game_id`, `wins` Int, `losses` Int, `ties` Int, `total_wagered` BigInt, `net_profit` BigInt).

### 2.14. Server Utilities & Scheduled Reminders
- `reaction_roles`: Message-to-role bindings (`id` UUID PK, `guild_id`, `channel_id`, `message_id`, `emoji_or_component_id`, `role_id`).
- `auto_voice_configs`: Auto voice channel generators (`id` UUID PK, `guild_id`, `parent_channel_id`, `channel_name_template`, `user_limit`, `bitrate`).
- `reminders`: Persistent reminder scheduler (`id` UUID PK, `user_id`, `guild_id`, `channel_id`, `message`, `trigger_at`, `repeat_interval` [NONE, DAILY, WEEKLY], `is_completed`).
- `guild_welcomer` / `guild_farewell`: Welcome and farewell cards (`guild_id` PK, `channel_id` (empty when not set up), `message_template`, `card_theme`, `background_url`, `background_file`, `text_color`, `is_enabled`, `text_message_enabled` (default false), `text_message` (default empty)). At most one of `background_url` and `background_file` is set; `background_file` names an upload in `storage/welcomer-backgrounds`. The two text columns come from migration `0001_welcomer_text_message`. They hold the optional text message sent with the card (see docs/modules.md).
- `audit_logs`: Security and administrative action audit trails (`id` UUID PK, `guild_id`, `actor_user_id`, `action`, `details` JSON, `ip_address`, `user_agent`, `created_at`). `GuildConfigService` writes `guild_config.<module>.update` entries with `details = { source: 'dashboard' | 'cli', changes: [{ field, before, after }] }`.

### 2.15. Web Dashboard
The dashboard uses these tables. The page design is in [dashboard.md](dashboard.md). The decision about sessions and credential theft is in [ADR-013](https://github.com/RirikoAI/RirikoBot/blob/develop/2.0.0/docs/archive/adr/ADR-013-dashboard-sessions-and-credential-theft-defense.md).
- `web_sessions`: Opaque server-side dashboard sessions. The primary key `id` is the SHA-256 hash (hex) of the session cookie; the raw value exists only in the `__Host-ririko_session` cookie. Columns: `user_id`, `created_at`, `last_seen_at`, `expires_at` (12 h absolute), `ip_address`, `user_agent`, `step_up_at`, `discord_access_token` and `discord_refresh_token` (AES-256-GCM ciphertexts in the `v<key version>.<iv>.<tag>.<data>` format, bound to the row as additional authenticated data), and `discord_token_expires_at`. The key version is part of each ciphertext, so there is no separate `key_version` column. Indexes on `user_id` (for "sign out everywhere") and `expires_at` (expiry cleanup). `webauthn_challenge` (`<purpose>:<challenge>`) and `webauthn_challenge_expires_at` hold the pending WebAuthn challenge, cleared by the single update that consumes it.
- `guild_config_versions`: Change feed for settings written outside the bot process. Primary key (`guild_id`, `module`), `version` (incremented on every write), `updated_at` (indexed). The dashboard and CLI bump it in the same transaction as the settings write; the bot's `GuildConfigWatcher` polls recent rows and emits `guild:configChanged`.
- `web_passkeys`: WebAuthn credentials per user. `id` is the credential ID (base64url); `user_id` (indexed), `name`, `public_key` (COSE, base64url), `counter`, `transports` (JSON), `device_type` (`singleDevice` or `multiDevice`), `backed_up`, `created_at`, `last_used_at`. Only public keys are stored.
- `web_known_devices`: Browsers each user has signed in from. Primary key (`user_id`, `device_hash`), where `device_hash` is the SHA-256 (hex) of the random `__Host-ririko_device` cookie; `first_seen_at`, `last_seen_at` (indexed). A sign-in whose device is not listed triggers a new-device DM. Rows unseen for a year (the cookie lifetime) are deleted at sign-in.
- `command_usage_daily`: Command usage counters. Primary key (`guild_id`, `day`, `command_name`), where `day` is the UTC day as `YYYY-MM-DD`; `count`. The bot's `CommandUsageRecorder` buffers counts from the router's `onCommandRun` hook and adds them every 60 seconds with `count = count + excluded.count`; rows older than 90 days are deleted.
- `bot_status`: One row per bot process (`id = 'bot'`): `gateway_ping_ms` (null before the first heartbeat), `guild_count`, `version`, `started_at`, `updated_at`. Written by `BotStatusReporter` every 30 seconds; a row older than 90 seconds means the bot is offline. The health probes can reuse it.
- `guild_voice_activity`: `guild_id` PK, `channels` (JSON list of `{ channelId, members }` for voice channels with at least one member who is not a bot), `updated_at`. Written by `BotStatusReporter` only when a guild's channels change; guilds with no active channel have no row.
- Guild TCG settings on `guild_settings`: `tcg_drops_enabled` (default false), `tcg_drop_channel_id` (null counts every channel), `tcg_drop_message_threshold` (50), `tcg_drop_start_hour` (8), `tcg_drop_end_hour` (23), `tcg_drop_claim_timeout_seconds` (60), `tcg_drop_cooldown_minutes` (5) and `tcg_manager_role_id`. Edited through the `tcg` module of `GuildConfigService`; `DropManager` reads them through `dropConfigFromSettings`.

---

## 3. Indexing & Transaction Integrity Rules
1. **Foreign Key Enforcement**: In SQLite, every connection explicitly executes `PRAGMA foreign_keys = ON;`.
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
4. **Time Indexes for the Retention Purge**: a delete by time alone needs an index on that time column. Migration `0003_data_retention_indexes` adds `ai_messages(created_at)`, `ai_conversations(updated_at)`, `music_history(played_at)`, `image_jobs(created_at)` and `audit_logs(created_at)`. The older `(guild_id, time)` and `(user_id, time)` indexes do not serve them. The migration is additive; it builds the indexes with plain `CREATE INDEX`, which blocks writes to a table while PostgreSQL builds its index.

---

## 4. Data Retention
The bot deletes data past a fixed period so the privacy policy can state the periods. `DataRetentionService` (`packages/services/src/privacy/data-retention.service.ts`) runs once per UTC day, starting one minute after the bot is ready, and checks every hour whether the current day has had a complete purge. The periods are the constant `RETENTION_DAYS`, so change them only together with the policy:

| Data | Table and column | Kept for | What is deleted |
|---|---|---|---|
| AI chat | `ai_messages.created_at` | 90 days | Messages older than the period. |
| AI chat | `ai_conversations.updated_at` | 90 days | Conversations not updated within the period that have no message left. The `summary` (text derived from chat) of every conversation not updated within the period is cleared. |
| Music history | `music_history.played_at` | 90 days | Plays older than the period. |
| Image jobs | `image_jobs.created_at` | 90 days | Jobs older than the period whose status is `COMPLETED` or `FAILED`. Jobs still `QUEUED` or `PROCESSING` stay. |
| Audit log | `audit_logs.created_at` | 365 days | Entries older than the period. |
| Server data | `guilds.left_at` | 90 days | Everything stored for a server the bot left, then its `guilds` row (section 4.1). The period is `RETENTION_DAYS.departedGuild`. |

How the purge behaves:

- The cutoff is the current time minus the period. A row exactly at the cutoff is kept; only rows older than it are deleted.
- Each repository has `deleteOlderThan(cutoff)`, which returns the number of rows it deleted. It deletes in batches of 5000 rows (`PURGE_BATCH_SIZE`): one statement removes at most 5000 primary keys found through the time index, and the loop ends when a batch comes back short. A first purge of a very large table therefore never runs as one long statement. The batches are not one transaction.
- The tables are purged one after another. A failure in one table is logged and the others still run; the day then stays open, so the next hourly check tries again.
- The purge logs one line, `[DataRetention] Purge finished: ai=…, musicHistory=…, imageJobs=…, auditLog=…, departedGuild=…`, with the counts and no row content (`departedGuild` counts the servers purged).
- Not covered here: `command_usage_daily` (90 days, `CommandUsageRecorder`), `web_sessions` and `web_known_devices` (cleaned when they expire). Servers the bot left are covered in section 4.1.

### 4.1. Delete a Server's Data After the Bot Leaves

When the bot leaves or is removed from a server, `GuildRepository.markInactive` sets `guilds.is_active` to false and `guilds.left_at` to the current time. It never moves `left_at` of a server that is already inactive. Adding the bot back (`upsert`, also through `recordInvite`) sets `is_active` to true and clears `left_at`, so the server keeps all its data. Migration `0004_guild_left_at` adds the column and sets `left_at` to the time the migration runs for servers that are already inactive, so their 90 days start at the deploy and nothing is purged before 90 days after it.

The same daily purge deletes the data of every server whose `left_at` is more than 90 days ago (`RETENTION_DAYS.departedGuild`). A server that left exactly at the cutoff is kept; one that left a millisecond earlier is purged. `GuildDataRepository` (`packages/database/src/repositories/guild-data.repository.ts`) does it:

- No table has a foreign key to `guilds`, so nothing cascades. `GUILD_DATA_INVENTORY` (`guild-data-inventory.ts`) lists every table with a `guild_id` column and what the purge does with it:
  - `delete` (37 tables): the rows with this `guild_id` are deleted.
  - `detach` (3 tables): `economy_transactions`, `music_saved_playlists` and `reminders` belong to users and only record the server where they were made. The purge keeps the rows and sets `guild_id` to null.
  - `exclude` (1 table): `waifu_guild_members.guild_id` is the id of a WaifuGuild (the card game), not a Discord server.
  - `GUILD_CHILD_DATA` lists the tables that hold no server id but belong to rows that are deleted: `ai_messages` (via `ai_conversations`), `giveaway_entries` and `giveaway_winners` (via `giveaways`), and `adventure_choices` (via `adventure_sessions`). They are deleted first.
  - Rows with a null `guild_id` (a DM conversation, an owner console audit entry) belong to no server and stay.
- Tables with no `guild_id` are never touched: user balances, cards, inventories, AI preferences and consent records.
- The test `guild-data-inventory.test.ts` reads both Drizzle schemas and fails when a table with a `guild_id` column is not in the inventory. **A new table with a `guild_id` column must be added to `GUILD_DATA_INVENTORY` (and a table that belongs to its rows to `GUILD_CHILD_DATA`) in the same change.**
- One server is one transaction. Inside it the purge reads the `guilds` row again (locked with `FOR UPDATE` on PostgreSQL) and does nothing unless the server is still inactive and left before the cutoff, so a server the bot was added back to a moment ago keeps its data. A failure rolls that server back; the others still run, and the day stays open for a retry.
- Each table is deleted in batches of 5000 rows (`deleteInBatches`), found by `rowid` (SQLite) or `ctid` (PostgreSQL). The last step deletes the `guilds` row.
- The log has one line per server with row counts per table and no content, for example `[DataRetention] Deleted server <id>: xp_accounts=12, guilds=1; unlinked from the server: reminders=2`.
- Servers the bot left before `guilds` existed were never recorded, so their data is not purged by this rule.

### 4.2. Erase One User's Data

`ririko user erase <discord_user_id>` answers an erasure request (see [development.md](development.md#41-erase-one-users-data)). `UserDataRepository` (`packages/database/src/repositories/user-data.repository.ts`) runs it, and `USER_DATA_INVENTORY` (`user-data-inventory.ts`) says what happens to each column that can hold a Discord user ID:

- `delete`: the rows belong only to the user (AI chats, consents, preferences, balance, inventory, cards, XP, reminders, music history, image jobs, sessions, passkeys, known browsers, memberships, and the `users` row). They are deleted. Tables that hold no user column but belong to deleted rows (`ai_messages`, `music_playlist_tracks`, `adventure_choices`) are listed in `USER_CHILD_DATA` and deleted first.
- `tombstone`: the row is shared with other people (a ledger entry, a trade, a giveaway winner, a case where the user is the moderator, the creator of a giveaway). The row stays and the ID becomes `erased:<first 16 hex digits of the SHA-256 of the ID>`. `audit_logs.actor_user_id` also loses the IP address and the browser name. A Waifu guild that the user leads alone is deleted; one with other members keeps them and loses the name of its leader.
- `keep`: the column holds no Discord user ID (`streamers.platform_user_id` is the ID on Twitch, YouTube or TikTok).
- Moderation records are kept unless the host adds `--include-moderation`: then cases about the user get a tombstone, and notes and warnings about the user are deleted. Cases, notes and warnings where the user is the moderator or author always get a tombstone.
- `USER_TEXT_DATA` lists the JSON columns that can carry an ID in a value or a key: `economy_transactions.metadata` (the other side of a transfer), `audit_logs.details`, `game_sessions.state` and, with `--include-moderation`, `moderation_cases.metadata`. The quoted ID is replaced by the tombstone, as text, in the rows of every user.
- Pending trades of the user are cancelled first and the cards of the other party go back from `IN_TRADE` to `IDLE`, so no card stays locked in a trade that cannot finish.
- The whole erasure is one transaction, with the audit entry in it. A failure rolls everything back.
- The test `user-data-inventory.test.ts` reads both Drizzle schemas and fails when a column that ends in `user_id`, `_by`, `_by_id`, `owner_id` or `moderator_id` is not in the inventory. **A new column that can hold a Discord user ID must be added to `USER_DATA_INVENTORY` with its action in the same change, and a new JSON column that can hold one to `USER_TEXT_DATA`.** A column with another name that holds a user ID is not found by the guard test: add it by hand.
- Free text is not searched: the `reason` of a moderation case or warning, and the content of a note, can name the user in words. The host decides about those when it handles the request.
