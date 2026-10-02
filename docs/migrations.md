# Data Migration Manual: Ririko 1.4.0 to 2.0.0

## 1. Migration Philosophy & Invariants
In accordance with Section 85 of `BLUEPRINT.md`: **The legacy bot is valuable production data.**
- Under no circumstances should users be told to "start over in 2.0".
- All user account balances, accumulated XP/Karma, guild configurations, reaction roles, Twitch subscriptions, and custom profile backgrounds MUST be migrated with **zero data loss**.
- The migration process must be idempotent, non-destructive, and testable via dry-run mode before execution.

---

## 2. Table & Column Mapping Matrix

| Legacy Entity (1.4.0 SQLite) | Target Drizzle Table (2.0.0) | Transformation & Field Logic |
|---|---|---|
| `User` (`userId`, `coins`, `karma`, `warns`, `isSuspended`) | `users`, `economy_balances`, `xp_accounts` | `userId` $\rightarrow$ `users.id`<br>`coins` $\rightarrow$ `economy_balances.wallet_balance`<br>`karma` $\rightarrow$ `xp_accounts.xp` & `karma`<br>`warns` $\rightarrow$ `users.warn_count`<br>`isSuspended` $\rightarrow$ `users.is_blacklisted` |
| `Guild` & `GuildConfig` | `guilds`, `guild_settings` | Merged into normalized `guild_settings` (prefix, welcomer, farewell, log channels). Plaintext tokens stripped. |
| `UserNote` | `moderation_notes` | `userId` $\rightarrow$ `target_user_id`, `authorId` $\rightarrow$ `author_user_id`, `text` $\rightarrow$ `content`. |
| `VoiceChannel` | `auto_voice_configs`, `avc_channels` | Active channels preserved; orphaned temporary channels pruned. |
| `ReactionRole` | `reaction_roles` | Normalized emoji strings and target role IDs preserved. |
| `MusicChannel` | `music_channels` | Mapped directly to dedicated guild music channels. |
| `Playlist` & `Track` | `music_saved_playlists`, `music_playlist_tracks` | Legacy playlists and track sequences preserved with zero track loss. |
| `TwitchSubscription` | `stream_subscriptions`, `streamers` | Migrated to multi-platform streamer model (`platform = 'TWITCH'`). |
| `Reminder` | `reminders` | Timestamps converted from ISO text to Unix epoch milliseconds. |
| `Item` & `ItemCategory` | `economy_items`, `economy_item_categories` | Preserves shop item names, prices, and descriptions. |

### 2.1. Real 1.4.0 Schema Fixture
The migration tests (`packages/database/src/migration/migration.test.ts`) build their legacy database from `packages/database/src/migration/__fixtures__/legacy-1.4.0-schema.sql`. That file is not hand-written. It was taken on 2026-10-01 from a database created by the published image `ririkoai/ririkobot:latest`:
- digest `sha256:c11e8defda3beb390a8ef673b92f82bb958952abfe214d49436388ab6bc9c012`, package version 1.4.1;
- the image was run once with `DATABASE_TYPE=better-sqlite3`, and its start command ran the 12 TypeORM migrations.

It holds the schema only. The seed step inserted no rows.

What the real data looks like, and how the transformer reads it:
- **Dates:** TypeORM's SQLite driver stores dates as UTC text without a zone (`2025-03-04 05:06:07.890`, or without milliseconds from `datetime('now')` defaults). `parseLegacyDate` reads them as UTC, so reminder times and created dates do not shift by the host's offset.
- **Booleans:** stored as `0` or `1`.
- **Integer ids:** shop items, categories, playlists, tracks, notes and reaction roles have integer ids. The 2.0 rows use their string form.
- **Guild config names:** `guild_config` names are the ones the 1.4.0 commands wrote:

  | Name | Meaning |
  |---|---|
  | `welcomer_channel` | Welcome card channel. |
  | `welcomer_enabled` | `true`/`false`. |
  | `welcomer_bg` | Welcome card background. |
  | `farewell_channel` | Farewell card channel. |
  | `farewell_enabled` | `true`/`false`. |
  | `farewell_bg` | Farewell card background. |
  | `karma-notification-enabled` | `enabled`/`disabled`. |
  | `freeGamesChannelId` | Free games channel. |
  | `twitch_channel` | Twitch alert channel. |
  | `ai_model` | AI model. |
  | `stablediffusion_model` | Stable Diffusion model. |
- **Playlists:** they belonged to a user, not a guild. Track order is the insertion (id) order within each playlist.

To refresh the fixture, run the image the same way, `docker cp` its `/app/data/ririko.db` out, and dump `sqlite_master`. Never edit the file by hand.

---

## 3. Migration CLI Tooling

The migration tool is packaged inside the `ririko` CLI:

### 3.1. Pre-Flight Inspection & Dry-Run
```bash
ririko migrate:legacy --source ./old-ririko.sqlite --dry-run
```
- Reads the SQLite database without modifying either database.
- Outputs an audit summary: total users, total balances, active guilds, potential schema anomalies.

### 3.2. Live Execution
```bash
ririko migrate:legacy --source ./old-ririko.sqlite --target postgresql://...
```
- Executes inside chunked transactions (500 records per batch).
- Generates initial double-entry transaction records in `economy_transactions` marked `source = 'MIGRATION_V1'`.

### 3.3. Post-Migration Verification
```bash
ririko migrate:verify --source ./old-ririko.sqlite --target postgresql://...
```
- Validates row counts and currency sums. Total coins across all legacy users must match total wallet balances in 2.0.0.

### 3.4. Rollback Plan
```bash
ririko migrate:rollback --batch-id <batch_uuid>
```
- Removes records tagged with the specific migration batch ID without affecting new user data created after launch.

## 4. Docker Upgrade From 1.4.0 (Read-Only Legacy Mount)

1.4.0 ran from `ririkoai/ririkobot:latest`. Its compose file kept the SQLite database in `./data/ririko.db`, mounted at `/app/data`. To upgrade to 2.0:
- Leave that folder exactly as it is.
- Mount it read-only at `/app/legacy`, next to a new volume for the 2.0 data.

```yaml
services:
  bot:
    volumes:
      - ririko_data:/app/data # new 2.0 data, owned by uid 10001
      - ./data:/app/legacy:ro # untouched 1.4.0 data
```

### 4.1. What Happens on First Start
The bot image sets `LEGACY_DATABASE_PATH=/app/legacy/ririko.db`. Before the bot builds its services or seeds any defaults, it migrates that file once (`runLegacyUpgrade` in `apps/bot/src/legacy-upgrade.ts`, which calls `upgradeLegacyDatabase` in `packages/database/src/migration/upgrade.ts`):
1. **No file there:** nothing happens and nothing is logged.
2. **Copy:** the file, plus any `-wal` or `-journal` file, is copied to a temporary directory while its sha256 is computed. SQLite only ever opens the copy, so the read-only mount is never opened by SQLite or written. Going back to 1.4.0 always works.
3. **Already recorded:** if `legacy_migrations` already has that sha256, the bot logs `• The 1.4.0 database at … was already migrated on …` and starts. Restarts never migrate twice.
4. **Target not empty:** if the 2.0 database already has users, or another 1.4.0 database was migrated into it, the bot logs a warning with the manual command and starts without migrating.
5. **Migrate:** otherwise `MigrationEngine` migrates the copy in one transaction and writes the `legacy_migrations` row (sha256, batch id, per-entity counts, coin totals, time) in the same transaction. The bot logs `✓ Migrated the 1.4.0 database at …: N users, N guilds, N coins (batch …)`.
6. **Coins do not match:** if the migrated coins would not add up to the 1.4.0 total (for example negative balances), nothing is written and the bot exits with `Legacy coin totals do not match …`.

### 4.2. Manual Command
Run it in the bot image with the same mounts, while the bot is stopped:
```bash
docker run --rm -v ./data:/app/legacy:ro -v ririko_data:/app/data <bot image> node apps/bot/dist/legacy-upgrade.js --dry-run
```
- `--dry-run` prints the audit and the counts without writing.
- `--force` migrates even when the 2.0 database already has users or another 1.4.0 database. Rows that already exist are kept (`onConflictDoNothing`).
- `--source <path>` reads a file other than `LEGACY_DATABASE_PATH`.

The command exits with 0 when it migrated or found the database already migrated, and with 1 when it skipped or failed.

### 4.3. Known Gaps
- **Settings that do not carry over yet:** some 1.4.0 guild settings land in tables 2.0 does not read (welcome and farewell cards, the free-games channel, the AI and image models). This is tracked in STORY-128. It must be fixed before `latest` moves to 2.0 (STORY-127).
- **Postgres targets:** the migration currently fails there, because the 1.4.0 integer ids go into uuid columns. The Docker upgrade targets SQLite (the image default).
