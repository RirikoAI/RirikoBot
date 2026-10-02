# Upgrading From Ririko 1.4.0 to 2.0

This guide is for people who run Ririko 1.4.0 with Docker Compose, using the image `ririkoai/ririkobot:latest` and a `./data` folder mounted at `/app/data`.

Ririko 2.0 is a full rewrite. On its first start it copies your 1.4.0 database once into a new 2.0 database. It never writes to your 1.4.0 files, so you can always go back.

## 1. Before You Start

- **Pick a version tag.** Until the 1.4.0 sunset, `latest` still points to 1.4.0. Use a versioned 2.x tag such as `ririkoai/ririkobot:2`. The 1.4.0 image stays available as `ririkoai/ririkobot:1.4.0`.
- **Use SQLite for the upgrade.** The 1.4.0 migration only targets SQLite, which is the image default. Do not set `DATABASE_DIALECT=postgres` for the first start.
- **The 2.0 image does not run as root.** It runs as uid `10001`. It cannot write to the root-owned `./data` folder that 1.4.0 created, and it does not need to.

## 2. Back Up Your Data

Stop 1.4.0, then copy the whole data folder:

```bash
docker compose down
cp -a ./data ./data-1.4.0-backup
```

The upgrade only reads `./data`. The backup is for your peace of mind.

## 3. Update the Compose File

Replace your 1.4.0 compose file with this one. Keep your values for the token, the application id and the owner id.

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

The two volumes matter most:

- `ririko_data:/app/data` is a new named volume for the 2.0 database. Docker creates it owned by the image user. If you prefer a folder, create a new empty one and run `sudo chown 10001:10001 <folder>` first. Do not reuse `./data`.
- `./data:/app/legacy:ro` mounts your 1.4.0 folder read-only. The image looks for `/app/legacy/ririko.db`. If your 1.4.0 `DATABASE_NAME` pointed to a different file name, rename the mount target or set `LEGACY_DATABASE_PATH` to the file inside `/app/legacy`.

The bot no longer serves a web page on port 3000, so the `ports` entry is gone. The web dashboard is a separate image, `ririkoai/ririkobot-dashboard`. [deployment.md section 2.2](deployment.md) describes the full production stack with the dashboard, PostgreSQL and Lavalink. Set it up after the upgrade, not during it.

## 4. Environment Variable Changes

2.0 still reads the 1.4.0 names below. Switch to the new names when you can. A new name always wins when both are set.

| 1.4.0 name | 2.0 name | Notes |
|---|---|---|
| `DISCORD_BOT_TOKEN` | `DISCORD_TOKEN` | |
| `DISCORD_APPLICATION_ID` | `DISCORD_CLIENT_ID` | |
| `AI_SERVICE_TYPE` | `DEFAULT_AI_PROVIDER` | `google_ai` becomes `gemini`. `openai` and `ollama` keep their names. `openrouter` runs on the OpenAI provider with OpenRouter's address. |
| `AI_SERVICE_API_KEY` | `GEMINI_API_KEY` or `OPENAI_API_KEY` | Picked by `AI_SERVICE_TYPE`. Ollama needs no key. |
| `AI_SERVICE_DEFAULT_MODEL` | `DEFAULT_AI_MODEL` | |
| `AI_SERVICE_BASE_URL` | `OPENAI_BASE_URL` or `OLLAMA_BASE_URL` | Picked by `AI_SERVICE_TYPE`. |
| `SP_DC` | `SPOTIFY_DC` | |
| `BOT_OWNER_ID`, `DEFAULT_PREFIX` | unchanged | |

Remove these. 2.0 does not use them:

- `DATABASE_TYPE` and `DATABASE_NAME`. 2.0 uses `DATABASE_URL`, which defaults to `./data/ririko.sqlite` inside the image.
- `APP_PORT` and `DISABLE_YOUTUBE`.

If `DATABASE_NAME` is still set, 2.0 refuses to start. See section 7.

## 5. First Start

```bash
docker compose pull
docker compose up -d
docker compose logs -f ririko-bot
```

Before the bot connects to Discord, it migrates `/app/legacy/ririko.db` once. Look for a line like this:

```text
✓ Migrated the 1.4.0 database at /app/legacy/ririko.db: 120 users, 3 guilds, 48210 coins (batch 7c1e…).
```

Lines that start with `⚠` under it list anything that did not carry over exactly.

Later restarts log that the database was already migrated and do not migrate again.

## 6. Check the Migration

- **The coin total:** the summary line shows the coins migrated. The bot stops with `Legacy coin totals do not match …` and writes nothing if the totals would differ.
- **A dry run:** with the bot stopped, this prints the audit and the counts without writing anything:

  ```bash
  docker compose run --rm ririko-bot node apps/bot/dist/legacy-upgrade.js --dry-run
  ```

- **In Discord:** check a few balances, levels and server settings, for example with `!balance` and `!profile`.

[migrations.md section 4](migrations.md) explains each step of the first-start migration and the manual command's `--force` and `--source` options.

## 7. What Is Not Migrated

- **Credentials.** 1.4.0 stored the Twitch and Stable Diffusion credentials in plain text in the database. 2.0 never copies them. The migration summary names the ones that were set. Enter them again in the dashboard, which keeps them encrypted.
- **The default Twitch alert channel** (`twitch_channel`). 2.0 has no default channel. Every migrated Twitch subscription keeps its own channel.
- **AI models 2.0 does not offer.** The guild falls back to the default model.

The migration summary lists the settings that were skipped for your servers.

## 8. If the Bot Stops With "This looks like a Ririko 1.4.0 setup"

2.0 found the old layout and stopped before it touched any file. The message lists what it found:

- **`DATABASE_NAME is set`:** remove `DATABASE_NAME` and `DATABASE_TYPE` (section 4).
- **`a 1.4.0 database is at /app/data/ririko.db`:** `./data` is still mounted at `/app/data`. Mount it at `/app/legacy:ro` instead (section 3).
- **`the data directory /app/data is not writable`:** `/app/data` is a root-owned folder. Use a named volume, or run `sudo chown 10001:10001 <folder>` on a new, empty folder.

Then run `docker compose up -d` again.

## 9. Going Back to 1.4.0

Your `./data` folder was only ever read, so 1.4.0 works as before:

1. Run `docker compose down`.
2. Restore your 1.4.0 compose file, with the image `ririkoai/ririkobot:1.4.0` and `./data:/app/data`.
3. Run `docker compose up -d`.

Anything that changed in 2.0 after the upgrade stays in the `ririko_data` volume. 1.4.0 does not see it. To try the upgrade again from scratch, remove that volume with `docker volume rm <project>_ririko_data`.
