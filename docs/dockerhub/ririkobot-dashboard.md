# Ririko AI Web Dashboard

The web dashboard for the Ririko AI Discord bot (2.x). Server admins sign in with Discord and manage modules, commands, the economy, moderation, the Waifu TCG and more from a browser. Bot owners get an owner console.

This image is only the dashboard. It works together with the bot image, `ririkoai/ririkobot`.

- Website: https://ririko.ai
- Documentation: https://ririko.ai/docs
- Dashboard guide: https://ririko.ai/docs/dashboard
- Source: https://github.com/RirikoAI/RirikoBot

## Tags

| Tag | What it is |
|---|---|
| `2` | The dashboard of the newest Ririko 2.x release. |
| `2.0` | The dashboard of the newest 2.0.x release. |
| `2.0.0` | Exactly version 2.0.0. It never changes. |
| `latest` | The newest 2.x release. Pin a version tag instead. |

Use the same tag for the bot and the dashboard, for example `2` for both. A tag with a dash, such as `2.1.0-rc.1`, is a test build. Do not use it for a real server.

There is no dashboard image for Ririko 1.4.0. Upgrade the bot first with https://ririko.ai/docs/upgrading-from-1.4, then add the dashboard.

## Quick start

The dashboard shares its database and data volume with the bot, so it is easiest to run both from the compose file in the repository, `docker-compose.production.yml`. It starts the bot, the dashboard, PostgreSQL and Lavalink together. The setup wizard writes the settings file for it. The full guide is at https://ririko.ai/docs/deployment

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

4. Open http://localhost:3000 and sign in with Discord.

## The dashboard service

This is the dashboard part of `docker-compose.production.yml`. It is a short view, not a full file: it needs the `postgres` service and the volumes from the full file, and the bot, which applies the database updates.

```yaml
web:
  image: ririkoai/ririkobot-dashboard:2
  restart: unless-stopped
  env_file: .env.production
  environment:
    DATABASE_DIALECT: postgres
    DATABASE_URL: postgres://ririko:your_database_password@postgres:5432/ririko
  ports:
    - '127.0.0.1:3000:3000'
  volumes:
    - ririko_data:/app/data
    - card_images:/app/public/cards
    - welcomer_backgrounds:/app/storage/welcomer-backgrounds
```

## Settings

The settings file (`.env.production`) needs these values:

- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`, from your Discord application.
- `DASHBOARD_URL`, the public address of the dashboard. Discord sends people back to `${DASHBOARD_URL}/api/auth/callback` after sign-in. Add that address as a redirect in your Discord application.
- `SECRET_VAULT_KEY`, 64 hex characters (`openssl rand -hex 32`). It encrypts stored credentials. Keep a safe copy: if you lose it, the stored credentials cannot be read again.
- `DATABASE_DIALECT` and `DATABASE_URL`, the same as the bot.

The image runs as user 10001, not as root. A folder you mount at `/app/data` must be writable for that user: `chown 10001:10001 <folder>`.

The dashboard listens on port 3000. The compose file publishes it on `127.0.0.1` only. To show it on the internet, put a reverse proxy or a tunnel in front of it, as section 4 of https://ririko.ai/docs/deployment explains.

## Health check

The dashboard answers `/health` and `/ready` on port 3000 (also `/api/health` and `/api/ready`). Docker uses `/health` for the container health check.

## Help

- Discord support server: https://discord.gg/UNMZx4qx8G
- Bugs and ideas: https://github.com/RirikoAI/RirikoBot/issues
