# Ririko AI Web Dashboard

The web dashboard for the Ririko AI Discord bot (2.x). Server admins sign in with Discord and manage modules, commands, the economy, moderation, the trading card game and more.

Source and documentation: https://github.com/RirikoAI/RirikoBot

## Tags

| Tag | What it is |
|---|---|
| `2`, `2.Y`, `2.Y.Z` | The dashboard for Ririko 2.x. Use the same version as `ririkoai/ririkobot`. |

There is no dashboard image for 1.4.0. Ririko 1.4.0 users upgrade the bot first, using the guide at https://github.com/RirikoAI/RirikoBot/blob/develop/2.0.0/docs/upgrading-from-1.4.md. The 1.4.0 bot stays available as `ririkoai/ririkobot:1.4.0`.

## Running it

The dashboard shares its database and data volume with the bot. It needs these variables:

- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.
- `DASHBOARD_URL`, the public address. Discord redirects to `${DASHBOARD_URL}/api/auth/callback` after sign-in.
- `SECRET_VAULT_KEY`, 64 hex characters (`openssl rand -hex 32`). It encrypts stored credentials. Keep it safe.
- `DATABASE_DIALECT` and `DATABASE_URL`, the same as the bot.

`docker-compose.production.yml` in the repository runs the bot, the dashboard, PostgreSQL and Lavalink together:
https://github.com/RirikoAI/RirikoBot/blob/develop/2.0.0/docs/deployment.md

The image runs as uid 10001 and listens on port 3000. `/health` and `/ready` answer for container health checks.
