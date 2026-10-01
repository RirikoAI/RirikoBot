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
