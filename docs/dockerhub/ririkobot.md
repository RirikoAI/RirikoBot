# Ririko AI Discord Bot

Ririko is a Discord bot that you host yourself. It plays music, chats with AI (Gemini, OpenAI-compatible APIs and Ollama), moderates your server, runs an economy with levels, hosts giveaways and mini-games, and has a card game of its own, the Waifu TCG. Slash commands and prefix commands both work.

This image is the bot, version 2.0. A separate image runs the web dashboard: `ririkoai/ririkobot-dashboard`.

- Website: https://ririko.ai
- Documentation: https://ririko.ai/docs
- Source: https://github.com/RirikoAI/RirikoBot

## Tags

| Tag | What it is |
|---|---|
| `2` | The newest Ririko 2.x release. Use this for a new install. |
| `2.0` | The newest 2.0.x release. |
| `2.0.0` | Exactly version 2.0.0. It never changes. |
| `1.4.0` | The last 1.x release. Kept for existing installs. |
| `latest` | The newest 2.x release. Pin a version tag instead. |

A tag with a dash, such as `2.1.0-rc.1`, is a test build. Do not use it for a real server.

## Quick start (new install)

You need a Discord bot token and an application ID from the Discord Developer Portal. Section 2.2 of https://ririko.ai/docs/deployment shows how to get both.

1. Save this as `docker-compose.yml`. Put your own values in place of `your_bot_token` and `your_application_id`:

   ```yaml
   services:
     ririko-bot:
       image: ririkoai/ririkobot:2
       container_name: ririko-bot
       environment:
         DISCORD_TOKEN: your_bot_token
         DISCORD_CLIENT_ID: your_application_id
       volumes:
         - ririko_data:/app/data
       restart: unless-stopped

   volumes:
     ririko_data:
   ```

2. Start the bot:

   ```bash
   docker compose up -d
   ```

3. Read the log:

   ```bash
   docker compose logs -f ririko-bot
   ```

4. Register the slash commands once:

   ```bash
   docker compose exec ririko-bot ririko commands:sync --global --all-guilds
   ```

   Then type `/ping` in your server. The bot answers.

This small setup stores its data in a SQLite file inside the `ririko_data` volume. It has no Lavalink server, so music uses the built-in player, which cannot play YouTube links. For Lavalink, a PostgreSQL database and the dashboard, use the full stack below.

The image runs as user 10001, not as root. A folder you mount at `/app/data` must be writable for that user: `chown 10001:10001 <folder>`.

## Full stack (bot, dashboard, PostgreSQL and Lavalink)

The repository has a ready compose file, `docker-compose.production.yml`. The setup wizard writes the settings file for it. The full guide is at https://ririko.ai/docs/deployment

1. Get the files:

   ```bash
   git clone https://github.com/RirikoAI/RirikoBot.git
   cd RirikoBot
   ```

2. Run the wizard. It opens in your browser at the address it prints, and writes `.env.production`:

   ```bash
   docker run --rm -it -p 127.0.0.1:3999:3999 -v "$PWD:/setup" ririkoai/ririkobot:2 ririko setup --docker --env-file /setup/.env.production --listen 0.0.0.0 --no-open
   ```

3. Start the stack:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production up -d
   ```

4. Register the slash commands:

   ```bash
   docker compose -f docker-compose.production.yml --env-file .env.production exec bot ririko commands:sync --global --all-guilds
   ```

## Upgrading from 1.4.0

2.0 copies your 1.4.0 database once, on its first start. It never writes to your old files. Mount your old `./data` folder read-only at `/app/legacy`, and give 2.0 a new volume at `/app/data`:

```yaml
volumes:
  - ririko_data:/app/data
  - ./data:/app/legacy:ro
```

Do not use `latest` for the upgrade. Use `ririkoai/ririkobot:2`.

The step-by-step guide covers the backup, the changed environment variable names, the first start and how to go back: https://ririko.ai/docs/upgrading-from-1.4

If you start 2.x with an unchanged 1.4.0 compose file, the bot prints these steps and stops without touching your files.

## Health check

The bot answers `/health` and `/ready` on port 8080 inside the container. Docker uses `/health` for the container health check. The port is not published.

## Help

- Discord support server: https://discord.gg/UNMZx4qx8G
- Bugs and ideas: https://github.com/RirikoAI/RirikoBot/issues
