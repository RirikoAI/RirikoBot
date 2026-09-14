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
