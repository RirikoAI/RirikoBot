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
| `Guild` & `GuildConfig` | `guilds`, `guild_settings`, `guild_welcomer`, `guild_farewell`, `free_game_channels`, `ai_guild_preferences`, `image_guild_settings` | Each setting goes to the table 2.0 reads it from (see the table in section 2.1). Plaintext tokens stripped. |
| `Configuration` | none | The Twitch and Stable Diffusion credentials are not migrated, because 1.4.0 stored them in plain text. The migration summary names the ones that were set, so the owner can enter them again in the dashboard. |
| `FreeGameNotification` | `free_game_announcements` | Ids become the 2.0 form (`epic-<id>`, `steam-<appId>`), in the guild's free-games channel, so games 1.4.0 posted are not posted again. Guilds without a free-games channel are skipped. |
| `UserNote` | `moderation_notes` | `userId` $\rightarrow$ `target_user_id`, `authorId` $\rightarrow$ `author_user_id`, `text` $\rightarrow$ `content`. |
| `VoiceChannel` | `auto_voice_configs`, `avc_channels` | Active channels preserved; orphaned temporary channels pruned. |
| `ReactionRole` | `reaction_roles` | Emoji strings and role IDs preserved. 1.4.0 stored no channel, so `channel_id` holds the guild ID until the first reaction to the message, when the bot saves the real channel. Until then the dashboard shows the channel as unknown. |
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

  | Name | Meaning | Migrated to |
  |---|---|---|
  | `welcomer_channel` | Welcome card channel. | `guild_welcomer.channel_id`. A guild with no channel gets no welcome card. |
  | `welcomer_enabled` | `true`/`false`. | `guild_welcomer.is_enabled`, false when unset. |
  | `welcomer_bg` | Welcome card background URL. | `guild_welcomer.background_url`. |
  | `farewell_channel` | Farewell card channel. | `guild_farewell.channel_id`, with the same rule. |
  | `farewell_enabled` | `true`/`false`. | `guild_farewell.is_enabled`. |
  | `farewell_bg` | Farewell card background URL. | `guild_farewell.background_url`. |
  | `karma-notification-enabled` | `enabled`/`disabled`. | `guild_settings.karma_notifications_enabled`. |
  | `freeGamesChannelId` | Free games channel. | `free_game_channels.channel_id`. |
  | `twitch_channel` | Default Twitch alert channel. | Not migrated. 2.0 has no default channel, and every migrated subscription keeps its own channel. |
  | `ai_model` | AI model (free text, usually an Ollama model). | `ai_guild_preferences` provider and model, when 2.0 offers the model (a `:latest` tag is ignored). Otherwise the summary names the guild and it uses the bot default. |
  | `stablediffusion_model` | Replicate model. | `image_guild_settings.default_provider = replicate`. 2.0 sets the Replicate model for the whole bot, not per guild. |
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

The step-by-step guide for users is [upgrading-from-1.4.md](upgrading-from-1.4.md). This section describes how the upgrade works.

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
- **Settings that do not carry over:** `twitch_channel`, AI models 2.0 does not offer, and the plaintext credentials (see section 2.1). The migration summary lists the ones that applied.
- **Postgres targets:** the migration currently fails there, because the 1.4.0 integer ids go into uuid columns. The Docker upgrade targets SQLite (the image default).

---

## 5. Moving a 2.0 SQLite Database to PostgreSQL (`ririko db:copy`)
`ririko migrate:legacy` only reads 1.4.0 databases. To move data that already lives in a 2.0 SQLite file (users, economy, guild settings, the Waifu TCG catalog and owned cards) to the PostgreSQL stack in `docker-compose.production.yml`, use `ririko db:copy`. It copies every table in one transaction and checks the result before it commits.

### 5.1. What the Command Does
- **Source:** the SQLite file named by `--from`. It is opened read-only, in one read transaction, and no pragma is set, so a database that a stopped process left in WAL mode is read as it is and is not modified.
- **Target:** the PostgreSQL URL in the `TARGET_DATABASE_URL` environment variable. The URL is never accepted as an argument, so the password stays out of shell history and `ps` output. The command prints only the host, port and database name.
- **Schema:** it migrates an empty target with `migrateDatabase`, the same runner the bot uses at startup, so the target gets the 2.0 schema and its own migration records (the source's records are never copied). A dry run on an empty target therefore creates the empty tables; it inserts no rows.
- **Copy:** tables go in foreign-key order with batched, parameterised INSERTs. Values are converted by the target column type: integer seconds or milliseconds to `timestamptz`, `0`/`1` to `boolean`, JSON text to `jsonb`. Integers are read exactly, so balances above 2^53 are not rounded.
- **Checks before COMMIT:** every table has the same row count on both sides, the wallet and bank totals of `economy_balances` match, and each serial or identity sequence is moved past the highest copied value.
- **Refusals:** it refuses, writes nothing and exits non-zero when the target has any rows, when a source table or column is missing in the target, when a required target column has no source, or when it meets a column type it does not know how to convert. The reason is printed. Any other failure rolls the whole copy back.

### 5.2. Options
| Option | Meaning |
|---|---|
| `--from <path>` | The 2.0 SQLite database file to copy. Required. |
| `--dry-run` | Run the whole copy and every check, print the table plan and counts, then roll back. Nothing is committed. |
| `--yes` | Required for a real run. Without `--dry-run` and without `--yes` the command stops before it connects. |
| `-b, --batch-size <n>` | Rows per INSERT statement (default 500). |

The command exits with 0 when the copy (or the dry run) passed all checks, and with 1 on a refusal, a failure or a row-count mismatch.

### 5.3. Runbook
Replace every `<placeholder>` with your own value. Nothing here names a real host.

1. **Stop the writers.** Stop the bot and the dashboard that use the SQLite file, so no row changes during the copy. Keep a copy of the file (`ririko.sqlite` and any `-wal` file next to it) until the new stack has run for a while.
2. **Prepare an empty target.** The target must hold no rows. If a bot or dashboard has already started against it, it will have written rows (for example the command catalog), so drop and recreate the schema:
   ```bash
   docker compose -f docker-compose.production.yml exec postgres \
     psql -U <db user> -d <db name> -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
   ```
   Keep the `bot` and `web` containers stopped while you do this.
3. **Reach Postgres from your machine.** The production compose file publishes no Postgres port. Forward one to your machine for the length of the copy, for example over SSH to the container's address on the host:
   ```bash
   ssh -N -L 15432:<postgres container address>:5432 <user>@<host>
   ```
4. **Set the target URL in the environment** (never on the command line):
   ```bash
   # bash
   read -rs TARGET_DATABASE_URL && export TARGET_DATABASE_URL   # type: postgres://<user>:<password>@127.0.0.1:15432/<db name>
   ```
   ```powershell
   # PowerShell
   $env:TARGET_DATABASE_URL = Read-Host 'Target URL'
   ```
5. **Dry run.** Check the plan and the refusal reasons before anything is committed:
   ```bash
   pnpm cli db:copy --from ./data/ririko.sqlite --dry-run
   ```
6. **Copy.** When the dry run is clean:
   ```bash
   pnpm cli db:copy --from ./data/ririko.sqlite --yes
   ```
   Read the per-table report. Every line must show equal source and target counts, and the economy line must say the totals match.
7. **Copy the data folders into the volumes.** The database holds the card catalog and owned cards, but the images are files. Copy these four folders into the matching volumes of the stack (list the real volume names with `docker volume ls`; compose prefixes them with the project name):

   | Local folder | Volume | Mounted at |
   |---|---|---|
   | `data/tcg` | the `ririko_data` volume | `/app/data/tcg` |
   | `public/cards` | the `card_images` volume | `/app/public/cards` |
   | `public/bosses` | the `boss_images` volume | `/app/public/bosses` |
   | `storage/welcomer-backgrounds` | the `welcomer_backgrounds` volume | `/app/storage/welcomer-backgrounds` |

   Run each copy with a throwaway container, so the files end up owned by the images' user (uid and gid 10001):
   ```bash
   docker run --rm -v "$PWD/public/cards:/from:ro" -v <card images volume>:/to alpine \
     sh -c 'cp -a /from/. /to/ && chown -R 10001:10001 /to'
   ```
   For `data/tcg`, mount the data volume and copy into `/to/tcg` (`mkdir -p /to/tcg && cp -a /from/. /to/tcg/ && chown -R 10001:10001 /to/tcg`). Do not copy the SQLite file itself into the data volume.
8. **Point the stack at PostgreSQL and start it.** Set `DATABASE_DIALECT=postgres` and `DATABASE_URL` for the new database (the production compose file already does), start `bot` and `web`, and check `/health` and `/ready` and a few known users, balances and cards.
9. **Clean up.** Close the port forward and clear `TARGET_DATABASE_URL` from your shell (`unset TARGET_DATABASE_URL` or `Remove-Item Env:TARGET_DATABASE_URL`).

### 5.4. Known Limits
- It copies a 2.0 database into an empty PostgreSQL database. It does not merge into a database that already has rows, does not copy PostgreSQL back to SQLite, and does not read 1.4.0 databases (use `ririko migrate:legacy` for those).
- A failed or refused real run commits nothing. Only the empty schema may remain; run step 2 again before you retry.
