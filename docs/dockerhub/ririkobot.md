# Ririko AI Discord Bot

Ririko is a Discord bot with music, AI chat, an economy, levels, moderation, giveaways, reminders and a Waifu trading card game. Slash and prefix commands are both supported.

Source and documentation: https://github.com/RirikoAI/RirikoBot

## Tags

| Tag | What it is |
|---|---|
| `2`, `2.Y`, `2.Y.Z` | Ririko 2.x. Use one of these for new installs. |
| `1.4.0` | The last 1.x release, kept for existing installs. |
| `latest` | Still Ririko 1.4.0 until the announced sunset date, then 2.x. Pin a version tag instead. |

## Upgrading from 1.4.0

2.0 migrates your 1.4.0 database on its first start and never writes to it. Mount your old `./data` folder read-only at `/app/legacy` and give 2.0 a new volume at `/app/data`:

```yaml
volumes:
  - ririko_data:/app/data
  - ./data:/app/legacy:ro
```

The step-by-step guide covers the backup, the environment variable changes, the first start and how to go back:
https://github.com/RirikoAI/RirikoBot/blob/develop/2.0.0/docs/upgrading-from-1.4.md

If you start 2.x with an unchanged 1.4.0 compose file, the bot prints these steps and exits without touching your files.

## Quick start (new install)

```bash
docker run -d --name ririko-bot \
  -e DISCORD_TOKEN=your_bot_token \
  -e DISCORD_CLIENT_ID=your_application_id \
  -v ririko_data:/app/data \
  ririkoai/ririkobot:2
```

The image runs as uid 10001. A bind mount at `/app/data` must be writable for it: `chown 10001:10001 <folder>`.

For the full stack with the web dashboard, PostgreSQL and Lavalink, see `docker-compose.production.yml` and https://github.com/RirikoAI/RirikoBot/blob/develop/2.0.0/docs/deployment.md.

## Dashboard

The web dashboard is a separate image: `ririkoai/ririkobot-dashboard`.
