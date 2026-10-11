# Upgrade From Ririko 1.4.0 to 2.0

This guide is for people who run Ririko 1.4.0 with Docker Compose. Your setup uses the image `ririkoai/ririkobot:latest` and a `./data` folder mounted at `/app/data`.

Ririko 2.0 is a full rewrite. On its first start, it copies your 1.4.0 database once into a new 2.0 database. It never writes to your 1.4.0 files, so you can always go back (section 9).

## 1. Before You Start

- **Use a version tag.** Do not use `latest` for 2.0. Use a 2.x tag such as `ririkoai/ririkobot:2`. The 1.4.0 image stays available as `ririkoai/ririkobot:1.4.0`.
- **Use SQLite for the upgrade.** The upgrade writes to SQLite only. This is the default of the image. Do not set `DATABASE_DIALECT=postgres` for the first start.
- **The 2.0 image does not run as root.** It runs as the user with uid `10001`. It cannot write to the `./data` folder that 1.4.0 made, and it does not need to.

## 2. Back Up Your Data

1. Stop Ririko 1.4.0:

   ```bash
   docker compose down
   ```

2. Copy the data folder:

   ```bash
   cp -a ./data ./data-1.4.0-backup
   ```

   The upgrade only reads `./data`. The copy is for your peace of mind.

## 3. Change the Compose File

1. Open your compose file (`docker-compose.yml`) and replace all of it with the text below.
2. Put your own values in place of `your_discord_bot_token`, `your_discord_application_id`, `your_discord_user_id` and `your_gemini_api_key`.

```yaml
services:
  ririko-bot:
    image: ririkoai/ririkobot:2
    container_name: ririko-bot
    environment:
      NODE_ENV: production
      DISCORD_TOKEN: your_discord_bot_token
      DISCORD_CLIENT_ID: your_discord_application_id
      BOT_OWNER_ID: your_discord_user_id
      DEFAULT_PREFIX: '!'
      DEFAULT_AI_PROVIDER: gemini
      GEMINI_API_KEY: your_gemini_api_key
    volumes:
      - ririko_data:/app/data # new 2.0 data, owned by uid 10001
      - ./data:/app/legacy:ro # your untouched 1.4.0 data
    restart: unless-stopped

volumes:
  ririko_data:
```

The two volumes are the important part:

- `ririko_data:/app/data` is a new named volume for the 2.0 database. Docker creates it with the right owner. If you want a folder instead, make a new empty folder and run `sudo chown 10001:10001 <folder>` on it. Do not reuse `./data`.
- `./data:/app/legacy:ro` mounts your 1.4.0 folder as read-only. The image looks for `/app/legacy/ririko.db`. If your 1.4.0 `DATABASE_NAME` was another file name, set `LEGACY_DATABASE_PATH` to the path of that file inside `/app/legacy`.

The bot does not serve a web page. So the compose file has no `ports` entry. The dashboard is a separate image, `ririkoai/ririkobot-dashboard`. Set it up after the upgrade with [deployment.md](deployment.md).

## 4. Change the Environment Variables

2.0 still reads the 1.4.0 names in this table. Change to the new names when you can. If both are set, the new name wins.

| 1.4.0 name | 2.0 name | Notes |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | `DISCORD_TOKEN` | |
| `DISCORD_APPLICATION_ID` | `DISCORD_CLIENT_ID` | |
| `AI_SERVICE_TYPE` | `DEFAULT_AI_PROVIDER` | `google_ai` becomes `gemini`. `openai` and `ollama` keep their names. `openrouter` runs on the OpenAI provider with the address of OpenRouter. |
| `AI_SERVICE_API_KEY` | `GEMINI_API_KEY` or `OPENAI_API_KEY` | `AI_SERVICE_TYPE` decides which one. Ollama needs no key. |
| `AI_SERVICE_DEFAULT_MODEL` | `DEFAULT_AI_MODEL` | |
| `AI_SERVICE_BASE_URL` | `OPENAI_BASE_URL` or `OLLAMA_BASE_URL` | `AI_SERVICE_TYPE` decides which one. |
| `SP_DC` | `SPOTIFY_DC` | |
| `BOT_OWNER_ID`, `DEFAULT_PREFIX` | no change | |

Remove these variables. 2.0 does not use them:

- `DATABASE_TYPE` and `DATABASE_NAME`. 2.0 uses `DATABASE_URL`. Inside the image it is `./data/ririko.sqlite`.
- `APP_PORT` and `DISABLE_YOUTUBE`.

If `DATABASE_NAME` is still set, 2.0 does not start (section 8).

## 5. Start Ririko 2.0

1. Download the new image:

   ```bash
   docker compose pull
   ```

2. Start the bot:

   ```bash
   docker compose up -d
   ```

3. Read the log:

   ```bash
   docker compose logs -f ririko-bot
   ```

   Before the bot connects to Discord, it migrates `/app/legacy/ririko.db` once. You see a line like this:

   ```text
   ✓ Migrated the 1.4.0 database at /app/legacy/ririko.db: 120 users, 3 guilds, 48210 coins (batch 7c1e…).
   ```

   A line that starts with `⚠` under it names something that did not carry over exactly.

On later restarts the bot logs that the database was already migrated. It does not migrate again.

## 6. Check the Migration

1. **Check the coin total.** The summary line shows the migrated coins. If the totals would be different, the bot writes nothing and stops with `Legacy coin totals do not match …`.
2. **Optional: make a dry run.** With the bot stopped, this command prints the audit and the counts, and writes nothing:

   ```bash
   docker compose run --rm ririko-bot node apps/bot/dist/legacy-upgrade.js --dry-run
   ```

3. **Check in Discord.** Look at a few balances, levels and server settings. For example, send `!balance` and `!profile`.

[migrations.md section 4](migrations.md#4-upgrade-a-docker-setup-from-140) explains each step of the migration. It also describes the options `--force` and `--source` of the manual command.

## 7. What Does Not Carry Over

- **Credentials.** 1.4.0 stored the Twitch and Stable Diffusion credentials as plain text in the database. 2.0 never copies them. The summary names the ones that were set. Enter them again in the dashboard, which keeps them encrypted.
- **The default Twitch alert channel** (`twitch_channel`). 2.0 has no default channel. Every Twitch subscription keeps its own channel.
- **AI models that 2.0 does not offer.** The server uses the default model.

The summary lists the settings that were skipped for your servers.

## 8. If the Bot Stops With "This looks like a Ririko 1.4.0 setup"

2.0 found the old layout and stopped before it touched any file. The message names what it found. Do the matching step, then run `docker compose up -d` again.

| Message | Step |
| --- | --- |
| `DATABASE_NAME is set` | Remove `DATABASE_NAME` and `DATABASE_TYPE` (section 4). |
| `a 1.4.0 database is at /app/data/ririko.db` | `./data` is still mounted at `/app/data`. Mount it at `/app/legacy:ro` instead (section 3). |
| `the data directory /app/data is not writable` | `/app/data` is a folder that root owns. Use a named volume. Or make a new empty folder and run `sudo chown 10001:10001 <folder>` on it. |

## 9. Go Back to 1.4.0

Your `./data` folder was only read, so 1.4.0 works as before.

1. Stop Ririko 2.0:

   ```bash
   docker compose down
   ```

2. Put back your 1.4.0 compose file. It uses the image `ririkoai/ririkobot:1.4.0` and the mount `./data:/app/data`.
3. Start 1.4.0:

   ```bash
   docker compose up -d
   ```

What changed in 2.0 stays in the `ririko_data` volume. 1.4.0 does not see it.

To try the upgrade again from the start, remove that volume. Replace `<project>` with the name of your compose project:

```bash
docker volume rm <project>_ririko_data
```
