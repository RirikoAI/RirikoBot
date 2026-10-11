# Move Your Data

This guide explains how Ririko moves data between databases. It covers three jobs:

| Job | Use |
| --- | --- |
| Move a Ririko 1.4.0 database into 2.0 | The automatic upgrade in section 4 (Docker), or the command in section 3 (without Docker). |
| Move a 2.0 SQLite database into PostgreSQL | `ririko db:copy` (section 5). |
| Change the schema when you install a new 2.x release | The bot does it by itself (section 6). |

If you only want the steps to upgrade a 1.4.0 Docker setup, read [upgrading-from-1.4.md](upgrading-from-1.4.md).

---

## 1. Rules

The 1.4.0 database is valuable data. The tools follow these rules:

- No user starts over in 2.0. Balances, XP, karma, server settings, reaction roles, Twitch subscriptions and playlists carry over with no loss.
- A migration never changes the 1.4.0 file.
- A migration can run again with no harm, and it has a dry-run mode that shows the result before it writes anything.

---

## 2. What Carries Over

### 2.1. Tables

| 1.4.0 data | 2.0 table | How it is changed |
| --- | --- | --- |
| `User` (`userId`, `coins`, `karma`, `warns`, `isSuspended`) | `users`, `economy_balances`, `xp_accounts` | `userId` becomes `users.id`. `coins` becomes `economy_balances.wallet_balance`. `karma` becomes `xp_accounts.xp` and `karma`. `warns` becomes `users.warn_count`. `isSuspended` becomes `users.is_blacklisted`. |
| `Guild` and `GuildConfig` | `guilds`, `guild_settings`, `guild_welcomer`, `guild_farewell`, `free_game_channels`, `ai_guild_preferences`, `image_guild_settings` | Each setting goes to the table where 2.0 reads it (section 2.2). |
| `Configuration` | none | The Twitch and Stable Diffusion credentials are not copied, because 1.4.0 stored them as plain text. The summary names the ones that were set. Enter them again in the dashboard. |
| `FreeGameNotification` | `free_game_announcements` | The ids use the 2.0 form (`epic-<id>`, `steam-<appId>`), in the free games channel of the server. Games that 1.4.0 announced are not announced again. A server without a free games channel is skipped. |
| `UserNote` | `moderation_notes` | `userId` becomes `target_user_id`. `authorId` becomes `author_user_id`. `text` becomes `content`. |
| `VoiceChannel` | `auto_voice_configs`, `avc_channels` | Active channels stay. Temporary channels that no longer exist are removed. |
| `ReactionRole` | `reaction_roles` | The emoji and the role ids stay. 1.4.0 stored no channel, so `channel_id` holds the server id until the first reaction to the message. Then the bot saves the real channel. The dashboard shows the channel as unknown until then. |
| `MusicChannel` | `music_channels` | Copied as it is. |
| `Playlist` and `Track` | `music_saved_playlists`, `music_playlist_tracks` | Every playlist and track stays, in the same order. |
| `TwitchSubscription` | `stream_subscriptions`, `streamers` | Saved as streamers with `platform = 'TWITCH'`. |
| `Reminder` | `reminders` | Times change from ISO text to Unix milliseconds. |
| `Item` and `ItemCategory` | `economy_items`, `economy_item_categories` | Names, prices and descriptions stay. |

### 2.2. Server Settings

1.4.0 stored server settings by name in `guild_config`:

| Name | Meaning | Where it goes |
| --- | --- | --- |
| `welcomer_channel` | The channel for the welcome card. | `guild_welcomer.channel_id`. A server without a channel gets no welcome card. |
| `welcomer_enabled` | `true` or `false`. | `guild_welcomer.is_enabled`. It is `false` when not set. |
| `welcomer_bg` | The URL of the welcome card background. | `guild_welcomer.background_url`. |
| `farewell_channel` | The channel for the farewell card. | `guild_farewell.channel_id`, with the same rule. |
| `farewell_enabled` | `true` or `false`. | `guild_farewell.is_enabled`. |
| `farewell_bg` | The URL of the farewell card background. | `guild_farewell.background_url`. |
| `karma-notification-enabled` | `enabled` or `disabled`. | `guild_settings.karma_notifications_enabled`. |
| `freeGamesChannelId` | The free games channel. | `free_game_channels.channel_id`. |
| `twitch_channel` | The default Twitch alert channel. | Not copied. 2.0 has no default channel. Every Twitch subscription keeps its own channel. |
| `ai_model` | The AI model (free text, often an Ollama model). | `ai_guild_preferences`, if 2.0 offers the model. A `:latest` tag is ignored. Otherwise the summary names the server, and it uses the default model of the bot. |
| `stablediffusion_model` | The Replicate model. | `image_guild_settings.default_provider = replicate`. 2.0 sets the Replicate model for the whole bot, not for each server. |

### 2.3. How the Data Is Read

- **Dates.** 1.4.0 stores dates as UTC text without a time zone, for example `2025-03-04 05:06:07.890`. The migration reads them as UTC, so times do not shift with the time zone of the machine.
- **Booleans.** They are stored as `0` or `1`.
- **Ids.** Shop items, categories, playlists, tracks, notes and reaction roles have integer ids in 1.4.0. 2.0 uses their text form.
- **Playlists.** A playlist belongs to a user, not to a server. The tracks keep their order.

For developers: the migration tests build their 1.4.0 database from `packages/database/src/migration/__fixtures__/legacy-1.4.0-schema.sql`. The file holds the schema of the published image `ririkoai/ririkobot` (digest `sha256:c11e8defda3beb390a8ef673b92f82bb958952abfe214d49436388ab6bc9c012`, package version 1.4.1). To refresh it, run that image once with `DATABASE_TYPE=better-sqlite3`, copy `/app/data/ririko.db` out with `docker cp`, and dump `sqlite_master`. Never edit the file by hand.

---

## 3. Migrate With the Command-Line Tool

Use this section if you run Ririko without Docker, or if you want to check a migration yourself. The target must be a SQLite database. The migration cannot write to PostgreSQL. To end on PostgreSQL, migrate to SQLite first and then follow section 5.

Run the commands in the repository folder, after `pnpm install`. Replace `./old-ririko.sqlite` with the path of your 1.4.0 database file.

1. Make a dry run. It reads the 1.4.0 file, changes nothing, and prints an audit with the number of users, the total of all balances, the active servers and any problems:

   ```bash
   pnpm cli migrate:legacy --source ./old-ririko.sqlite --dry-run
   ```

2. Run the migration. It writes in batches of 500 records, and creates the first ledger entries in `economy_transactions` with `source = 'MIGRATION_V1'`. The target is `./data/ririko.sqlite` unless you set `--target`:

   ```bash
   pnpm cli migrate:legacy --source ./old-ririko.sqlite
   ```

3. Verify the result. The command compares the number of users and the total of all coins. The two totals must be equal:

   ```bash
   pnpm cli migrate:verify --source ./old-ririko.sqlite
   ```

   The output ends with `VERIFIED OK`. If it says `FAILED`, the command ends with exit code 1.

---

## 4. Upgrade a Docker Setup From 1.4.0

The step-by-step guide is [upgrading-from-1.4.md](upgrading-from-1.4.md). This section explains what the bot does.

Ririko 1.4.0 ran from the image `ririkoai/ririkobot:latest`. Its compose file kept the SQLite database in `./data/ririko.db`, mounted at `/app/data`. To upgrade:

- Leave that folder exactly as it is.
- Mount it read-only at `/app/legacy`, next to a new volume for the 2.0 data.

```yaml
services:
  bot:
    volumes:
      - ririko_data:/app/data # new 2.0 data, owned by uid 10001
      - ./data:/app/legacy:ro # untouched 1.4.0 data
```

### 4.1. What Happens on the First Start

The bot image sets `LEGACY_DATABASE_PATH=/app/legacy/ririko.db`. Before the bot builds its services or adds default data, it migrates that file once:

1. **No file there.** Nothing happens and nothing is logged.
2. **Copy.** The bot copies the file, and any `-wal` or `-journal` file next to it, to a temporary folder. It computes the sha256 of the file at the same time. SQLite opens only the copy. So the read-only mount is never opened or written, and you can always go back to 1.4.0.
3. **Already recorded.** If the table `legacy_migrations` already has that sha256, the bot logs `• The 1.4.0 database at … was already migrated on …` and starts. A restart never migrates twice.
4. **Target not empty.** The 2.0 database may already have users. Or another 1.4.0 database may be in it. Then the bot logs a warning with the command to run yourself. It starts without a migration.
5. **Migrate.** Otherwise the bot migrates the copy in one transaction. In the same transaction it writes a row to `legacy_migrations` with the sha256, the batch id, the counts for each entity, the coin totals and the time. The bot logs `✓ Migrated the 1.4.0 database at …: N users, N guilds, N coins (batch …)`.
6. **Coins do not match.** The migrated coins may not add up to the 1.4.0 total, for example because of negative balances. Then the bot writes nothing and stops with `Legacy coin totals do not match …`.

### 4.2. Run It by Hand

Run the migration yourself with the bot stopped. Use the same mounts as the bot. Replace `<bot image>` with the image you run, for example `ririkoai/ririkobot:2`:

```bash
docker run --rm -v ./data:/app/legacy:ro -v ririko_data:/app/data <bot image> node apps/bot/dist/legacy-upgrade.js --dry-run
```

The options:

| Option | Meaning |
| --- | --- |
| `--dry-run` | Print the audit and the counts. Write nothing. |
| `--force` | Migrate even when the 2.0 database already has users or another 1.4.0 database. Rows that already exist stay as they are. |
| `--source <path>` | Read another file than `LEGACY_DATABASE_PATH`. |

The command ends with exit code 0 when it migrated or found the database already migrated. It ends with exit code 1 when it skipped the migration or failed.

### 4.3. Limits

- **Settings that do not carry over:** `twitch_channel`, AI models that 2.0 does not offer, and the plain-text credentials (section 2). The summary lists the settings that did apply.
- **PostgreSQL.** The upgrade writes to SQLite only. To use the PostgreSQL stack of [deployment.md](deployment.md), upgrade with the SQLite compose file of the upgrade guide first. Then move the 2.0 database with section 5.

---

## 5. Move a 2.0 SQLite Database to PostgreSQL

`ririko migrate:legacy` reads 1.4.0 databases only. To move data that already lives in a 2.0 SQLite file to the PostgreSQL stack of [deployment.md](deployment.md), use `ririko db:copy`. It moves users, economy, server settings, the Waifu TCG catalog and the owned cards. It copies every table in one transaction and checks the result before it commits.

### 5.1. What the Command Does

- **Source.** It opens the SQLite file named by `--from` read-only, in one read transaction. It sets no pragma. A database that a stopped process left in WAL mode is read as it is and not changed.
- **Target.** The PostgreSQL address comes only from the environment variable `TARGET_DATABASE_URL`. The command never accepts it as an argument, so the password stays out of your shell history and process list. The command prints only the host, the port and the database name.
- **Schema.** It first migrates an empty target with the same runner that the bot uses at start. The target gets the 2.0 schema and its own migration records. The records of the source are never copied. So a dry run on an empty target creates the empty tables, but no rows.
- **Copy.** It copies the tables in foreign-key order with batched INSERT statements. It converts values to the type of the target column: integer seconds or milliseconds to `timestamptz`, `0` and `1` to `boolean`, JSON text to `jsonb`. It reads integers exactly, so balances above 2^53 are not rounded.
- **Checks before COMMIT.** Every table has the same row count on both sides. The wallet and bank totals of `economy_balances` are equal. Each serial or identity sequence moves past the highest copied value.
- **Refusals.** The command writes nothing and exits with a code other than 0 in these cases:
  - the target has rows;
  - a table or column of the source is missing in the target;
  - a required column of the target has no source;
  - it meets a column type that it cannot convert.

  It prints the reason. Any other failure rolls back the whole copy.

### 5.2. Options

| Option | Meaning |
| --- | --- |
| `--from <path>` | The 2.0 SQLite file to copy. Required. |
| `--dry-run` | Run the whole copy and every check, print the plan and the counts, then roll back. Nothing is committed. |
| `--yes` | Required for a real run. Without `--dry-run` and without `--yes`, the command stops before it connects. |
| `-b, --batch-size <n>` | Rows in each INSERT statement. The default is 500. |

The command ends with exit code 0 when the copy (or the dry run) passed every check. It ends with exit code 1 after a refusal, a failure or a row-count mismatch.

### 5.3. Steps

Replace every `<placeholder>` with your own value.

1. **Stop the writers.** Stop the bot and the dashboard that use the SQLite file, so no row changes during the copy. Keep a copy of the file (`ririko.sqlite` and any `-wal` file next to it) until the new stack has run for a while.
2. **Prepare an empty target.** The target must have no rows. If a bot or dashboard already started on it, it wrote rows, for example the command list. Drop and recreate the schema. Keep the `bot` and `web` containers stopped:

   ```bash
   docker compose -f docker-compose.production.yml exec postgres psql -U <db user> -d <db name> -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
   ```

3. **Reach PostgreSQL from your computer.** The compose file does not publish the PostgreSQL port. Forward a port to your computer for the time of the copy, for example with SSH to the address of the container on the host:

   ```bash
   ssh -N -L 15432:<postgres container address>:5432 <user>@<host>
   ```

4. **Set the target address in the environment.** Never put it in the command line. In Bash:

   ```bash
   read -rs TARGET_DATABASE_URL && export TARGET_DATABASE_URL
   ```

   Type `postgres://<user>:<password>@127.0.0.1:15432/<db name>` and press Enter. In PowerShell:

   ```powershell
   $env:TARGET_DATABASE_URL = Read-Host 'Target URL'
   ```

5. **Make a dry run.** It shows the plan and the reasons for any refusal, and commits nothing:

   ```bash
   pnpm cli db:copy --from ./data/ririko.sqlite --dry-run
   ```

6. **Copy.** Do this when the dry run is clean:

   ```bash
   pnpm cli db:copy --from ./data/ririko.sqlite --yes
   ```

   Read the report for each table. Every line must show equal counts for the source and the target. The economy line must say that the totals match.
7. **Copy the image folders into the volumes.** The database holds the card catalog and the owned cards, but the images are files. Copy these four folders into the volumes of the stack. To list the real volume names, run `docker volume ls`. Compose adds the project name in front of each name.

   | Local folder | Volume | Mounted at |
   | --- | --- | --- |
   | `data/tcg` | `ririko_data` | `/app/data/tcg` |
   | `public/cards` | `card_images` | `/app/public/cards` |
   | `public/bosses` | `boss_images` | `/app/public/bosses` |
   | `storage/welcomer-backgrounds` | `welcomer_backgrounds` | `/app/storage/welcomer-backgrounds` |

   Copy each folder with a throwaway container. The files then belong to the user of the images (uid and gid 10001). This example copies the card images:

   ```bash
   docker run --rm -v "$PWD/public/cards:/from:ro" -v <card images volume>:/to alpine sh -c 'cp -a /from/. /to/ && chown -R 10001:10001 /to'
   ```

   For `data/tcg`, mount the data volume and copy into `/to/tcg`:

   ```bash
   docker run --rm -v "$PWD/data/tcg:/from:ro" -v <data volume>:/to alpine sh -c 'mkdir -p /to/tcg && cp -a /from/. /to/tcg/ && chown -R 10001:10001 /to/tcg'
   ```

   Do not copy the SQLite file into the data volume.
8. **Start the stack.** The production compose file already sets `DATABASE_DIALECT=postgres` and `DATABASE_URL`. Start `bot` and `web`. Check `/health` and `/ready`, and a few known users, balances and cards.
9. **Clean up.** Close the port forward. Clear the address from your shell. In Bash:

   ```bash
   unset TARGET_DATABASE_URL
   ```

   In PowerShell:

   ```powershell
   Remove-Item Env:TARGET_DATABASE_URL
   ```

### 5.4. Limits

- The command copies a 2.0 database into an empty PostgreSQL database. It does not merge into a database that has rows. It does not copy PostgreSQL back to SQLite. It does not read 1.4.0 databases. For those, use section 3.
- A failed or refused real run commits nothing. Only the empty schema can remain. Do step 2 again before you retry.

---

## 6. Schema Changes in 2.x

Sections 3 to 5 move data. When you install a new 2.x release, the schema changes through versioned migrations (`ririko db:migrate`). [database.md](database.md) explains how they work.

- **Self-hosters.** The bot migrates by itself when it starts. [deployment.md section 5](deployment.md#5-upgrade) shows how to make a dump before an upgrade, how to restore it, and how to run the migrations yourself with `DB_AUTO_MIGRATE=false`.
- **Hosts that deploy through CI.** The deploy runs the migration as a separate step. [release.md sections 8.6 to 8.8](release.md#86-migrations-on-a-host) explain the failure cases and the safety check against old releases. They also explain how to restore the pre-deploy dump, and how to adopt a database that has no migration records.
