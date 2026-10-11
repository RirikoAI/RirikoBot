# Database Migration Specification (Ririko 1.4.0 -> 2.0.0)

## 1. Migration Strategy Overview

Ririko 1.4.0 relied on TypeORM with a local SQLite database (`data/database.sqlite` or `database.sqlite`), containing 17 entities and 12 historical schema migrations.
Ririko 2.0.0 transitions to **Drizzle ORM** supporting both **PostgreSQL** (production) and **SQLite** (development/self-hosting).

### Core Migration Principles:
1. **Zero Data Loss**: Every historical record representing user balances, levels, karma, admin notes, custom playlists, guild configurations, reminders, and reaction roles must be safely transformed and imported.
2. **Read-Only Source Guarantee**: The migration script opens the legacy SQLite file in read-only mode (`{ readonly: true }`) to ensure the legacy database is never mutated or corrupted.
3. **Dry-Run & Verification Mode**: The CLI provides a `--dry-run` flag to validate schema transformations and report discrepancies before writing a single byte to the target database.
4. **Idempotency**: Running the migration multiple times will update or skip existing records without creating duplicate entries or violating foreign key constraints.

---

## 2. Table Transformation Mapping

### 2.1. Users & Balances
- **Legacy Entity**: `User`
- **Target Tables**: `users`, `economy_balances`, `economy_accounts`
- **Mapping Logic**:
  - `User.id` -> `users.id` (Discord Snowflake, primary key)
  - `User.username` -> `users.username`
  - `User.displayName` -> `users.display_name`
  - `User.backgroundImageURL` -> `users.profile_background_url`
  - `User.coins` -> `economy_balances.wallet_balance` (INTEGER -> BIGINT)
  - `User.karma` -> `economy_balances.karma` and `economy_balances.xp`
  - `User.warns` -> `users.warn_count`
  - `User.pointsSuspended` -> `economy_accounts.is_frozen`
  - `User.commandsSuspended` -> `users.is_blacklisted`
  - `User.doNotNotifyOnLevelUp` -> `users.notify_level_up` (inverted boolean)
  - `User.createdAt`, `User.updatedAt` -> `users.created_at`, `users.updated_at`

### 2.2. Guilds & Configurations
- **Legacy Entities**: `Guild`, `GuildConfig`
- **Target Tables**: `guilds`, `guild_settings`
- **Mapping Logic**:
  - `Guild.id` -> `guilds.id`
  - `Guild.name` -> `guilds.name`
  - `Guild.prefix` -> `guild_settings.prefix` (defaults to `!`)
  - Legacy `GuildConfig` stored key-value pairs per guild (`welcomer_enabled`, `welcomer_channel`, `welcomer_bg`, `farewell_enabled`, `farewell_channel`, `farewell_bg`, `karma-notification-enabled`, `ai_model`).
  - **Transformation**: Pivoted into typed columns inside `guild_settings`:
    - `welcomer_enabled` (boolean)
    - `welcomer_channel_id` (string)
    - `welcomer_background_url` (string)
    - `farewell_enabled` (boolean)
    - `farewell_channel_id` (string)
    - `farewell_background_url` (string)
    - `karma_notifications_enabled` (boolean)
    - `ai_model_name` (string)

### 2.3. Moderation Notes
- **Legacy Entity**: `UserNote`
- **Target Table**: `moderation_notes`
- **Mapping Logic**:
  - `UserNote.id` -> `moderation_notes.id` (UUID)
  - `UserNote.userId` -> `moderation_notes.target_user_id`
  - `UserNote.guildId` -> `moderation_notes.guild_id`
  - `UserNote.note` -> `moderation_notes.content`
  - `UserNote.createdBy` -> `moderation_notes.author_user_id`
  - `UserNote.createdAt`, `UserNote.updatedAt` -> `moderation_notes.created_at`, `moderation_notes.updated_at`

### 2.4. Music Channels, Playlists & Tracks
- **Legacy Entities**: `MusicChannel`, `Playlist`, `Track`
- **Target Tables**: `music_channels`, `music_playlists`, `music_playlist_tracks`
- **Mapping Logic**:
  - `MusicChannel.id` -> `music_channels.channel_id`
  - `MusicChannel.guildId` -> `music_channels.guild_id`
  - `Playlist.id` -> `music_playlists.id`
  - `Playlist.name` -> `music_playlists.name`
  - `Playlist.userId` -> `music_playlists.owner_user_id`
  - `Playlist.author` -> `music_playlists.author_name`
  - `Playlist.public` -> `music_playlists.is_public`
  - `Playlist.plays` -> `music_playlists.play_count`
  - `Track.id` -> `music_playlist_tracks.id`
  - `Track.name` -> `music_playlist_tracks.title`
  - `Track.url` -> `music_playlist_tracks.url`
  - `Track.playlistId` -> `music_playlist_tracks.playlist_id`

### 2.5. Auto Voice Channels (AVC)
- **Legacy Entity**: `VoiceChannel`
- **Target Table**: `avc_channels`
- **Mapping Logic**:
  - `VoiceChannel.id` -> `avc_channels.channel_id`
  - `VoiceChannel.name` -> `avc_channels.name`
  - `VoiceChannel.parentId` -> `avc_channels.parent_channel_id` (`0` represents generator root)
  - `VoiceChannel.guildId` -> `avc_channels.guild_id`

### 2.6. Reminders
- **Legacy Entity**: `Reminder`
- **Target Table**: `reminders`
- **Mapping Logic**:
  - `Reminder.id` -> `reminders.id`
  - `Reminder.userId` -> `reminders.user_id`
  - `Reminder.channelId` -> `reminders.channel_id`
  - `Reminder.guildId` -> `reminders.guild_id`
  - `Reminder.message` -> `reminders.message`
  - `Reminder.scheduledTime` -> `reminders.trigger_at`
  - `Reminder.sent` -> `reminders.is_completed`
  - `Reminder.repeat` -> `reminders.repeat_interval` (`none`, `daily`, `weekly`)

### 2.7. Reaction Roles
- **Legacy Entity**: `ReactionRole`
- **Target Table**: `reaction_roles`
- **Mapping Logic**:
  - `ReactionRole.id` -> `reaction_roles.id`
  - `ReactionRole.guildId` -> `reaction_roles.guild_id`
  - `ReactionRole.messageId` -> `reaction_roles.message_id`
  - `ReactionRole.emoji` -> `reaction_roles.emoji_or_custom_id`
  - `ReactionRole.roleId` -> `reaction_roles.role_id`

### 2.8. Stream Subscriptions & Notifications
- **Legacy Entities**: `StreamSubscription`, `StreamNotification`, `TwitchStreamer`
- **Target Tables**: `stream_subscriptions`, `stream_notifications`, `stream_creators`
- **Mapping Logic**:
  - `StreamSubscription.twitchUserId` -> `stream_subscriptions.creator_identifier` (`platform = 'twitch'`)
  - `StreamSubscription.channelId` -> `stream_subscriptions.target_channel_id`
  - `StreamSubscription.guildId` -> `stream_subscriptions.guild_id`
  - `StreamNotification.streamId` -> `stream_notifications.stream_session_id`
  - `StreamNotification.notified` -> `stream_notifications.is_dispatched`

### 2.9. Items & Economy Catalog
- **Legacy Entities**: `Item`, `ItemCategory`
- **Target Tables**: `economy_items`, `economy_item_categories`
- **Mapping Logic**:
  - Direct 1:1 schema mapping into normalized item catalog.

### 2.10. Legacy `Configuration` Table
- **Legacy Entity**: `Configuration` (applicationId, twitchClientId, twitchClientSecret, stableDiffusionApiToken)
- **Migration Policy**: **DO NOT MIGRATE TO DATABASE**.
- **Reason**: Storing plaintext client secrets and API keys in relational tables is a major security vulnerability. The migration script displays instructions directing the administrator to place these credentials into their `.env` file under `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `REPLICATE_API_TOKEN`.

---

## 3. Migration CLI Operations

The operator CLI (`apps/cli`) includes dedicated migration subcommands:

### 3.1. Dry Run Pre-flight Check
```bash
ririko migrate legacy --source ./data/legacy-database.sqlite --dry-run
```
Output:
```text
[DRY RUN] Inspecting legacy database: ./data/legacy-database.sqlite
[DRY RUN] Detected 1,420 Users, 58 Guilds, 12 Playlists, 340 Reminders, 45 Reaction Roles.
[DRY RUN] Validating foreign keys... OK.
[DRY RUN] Checking schema transformations... OK.
[DRY RUN] 0 errors, 0 orphaned rows detected. Ready to migrate.
```

### 3.2. Executing Real Migration
```bash
ririko migrate legacy --source ./data/legacy-database.sqlite --target-env production
```
- Opens SQLite source in read-only mode.
- Initiates target transaction.
- Streams batches of 500 rows.
- Computes SHA-256 validation checksums.
- Commits transaction and writes a timestamped migration report: `data/migration-report-YYYYMMDD.json`.

### 3.3. Post-Migration Verification
```bash
ririko migrate verify --source ./data/legacy-database.sqlite
```
- Validates row counts between source tables and target Drizzle tables.
- Validates that every user coin balance matches the legacy user coins column.
- Flags any discrepancy with an exit code of `1`.

### 3.4. Rollback Plan
If target database corruption occurs during migration:
- The entire operation is wrapped inside a database transaction (`BEGIN ... COMMIT / ROLLBACK`), ensuring automatic rollback on error.
- If migrating into an existing target database, a pre-migration snapshot is created (`pg_dump` or SQLite copy).
