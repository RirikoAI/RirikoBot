# Handover Notes: STORY-122 Production Orchestration & Health Probes

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## FLAG · 2026-10-01T15:01:55Z · from STORY-121 · Claude Code (Opus 5.5)

**Finding**: Grooming STORY-121 found four gaps that the production compose file will hit.
1. **Postgres has no production schema bootstrap.**
   - `packages/database/drizzle.config.ts` is SQLite-only, so `drizzle-kit push` cannot target Postgres.
   - `createPostgresClient` (`packages/database/src/client/postgres.ts:6`) never migrates. SQLite auto-migrates in `createSqliteClient`.
   - Only `ensureAdventureSchema` and `ensureCardSerialSchema` run additive DDL at bot startup.
   - The only full Postgres schema comes from `drizzle-kit export` inside `packages/services/src/adventure/__tests__/postgres.integration.test.ts`.
   - A bot pointed at an empty Postgres database will fail on its first query.
2. **The compose sketch in `docs/deployment.md` section 2.2 is stale.**
   - It passes `ENCRYPTION_SECRET`, `NEXTAUTH_SECRET` and `NEXTAUTH_URL`.
   - The config schema (`packages/core/src/config/schema.ts`) uses `SECRET_VAULT_KEY`, `DASHBOARD_URL`, `DISCORD_CLIENT_SECRET` and `DATABASE_DIALECT=postgres`.
   - The `asset_cache:/app/assets/cache` volume matches no path the code uses.
3. **Shared volumes are missing from the sketch.**
   - The bot and the dashboard both write `public/cards`: `CardImageService` renders and caches cards, and the dashboard album draws them.
   - Both read card art from `data/tcg/images` through `waifu_assets.localStoragePath`.
   - In SQLite mode, both use `data/ririko.sqlite`.
   - The bot also writes `public/bosses`.
   - The sketch mounts only `welcomer_backgrounds` in the web service.
4. **Lavalink**: `lavalink/` is a gitignored local install (`Lavalink.jar` plus `application.yml`) and is excluded from the STORY-121 build context. Compose should use the official Lavalink 4 image with the repository's plugin configuration.

**Impact on this ticket**:
- Regroom STORY-122 before it leaves BACKLOG.
- Add a task, or a separate story, for the Postgres schema bootstrap. For example: generate Postgres DDL the way `db:generate-ddl` does for SQLite and apply it at startup under an advisory lock, or ship a one-shot migrate command in the bot image.
- Rewrite section 2.2 with the real env names and the shared volumes.
- The images run as uid 10001. Named volumes inherit the owner of the directories the images create. Bind mounts must be chowned on the host.

---

## FLAG · 2026-10-01T15:54:49Z · from STORY-121 · Claude Code (Opus 5.5)

**Finding**: Docker Hub already serves 1.4.0. The maintainer is logged in with `docker login`. These figures come from the Hub API on 2026-10-01.
- `ririkoai/ririkobot`:
  - It has one tag, `latest`: linux/amd64, 708 MB, pushed 2025-09-27, 1,153 pulls.
  - There is no versioned tag, so if `latest` moves, 1.4.0 can only be pulled by digest.
- `ririkoai/ririkobot-dashboard`: exists, with no tags and 0 pulls.
- The 1.4.0 image comes from `.local/RirikoBot/Dockerfile`:
  - It runs as root.
  - Its `CMD` runs the TypeORM migrations and seeds, then `start:prod`.
  - It serves port 3000.
- The 1.4.0 production compose (`.local/RirikoBot/docker-compose.production.yml`) tells users to run:
  - `image: ririkoai/ririkobot:latest`
  - `./data:/app/data` (a bind mount)
  - `DATABASE_NAME: /app/data/ririko.db`
  - `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID` and `AI_SERVICE_TYPE`, `AI_SERVICE_API_KEY`, `AI_SERVICE_DEFAULT_MODEL`.

If the 2.0 `bot-runner` image were pushed as `latest` today, every user who runs `docker compose pull`, or Watchtower, would get 2.0 unannounced, and:
1. The bot would open a new, empty `/app/data/ririko.sqlite`. Their 1.4.0 data in `/app/data/ririko.db` would be ignored, but not deleted. 2.0 does not read `DATABASE_NAME`.
2. The bot would likely crash with `EACCES`. Their `./data` bind mount was written as root by the 1.4.0 container, and 2.0 runs as uid 10001.
3. AI would be unconfigured: `AI_SERVICE_*` has no alias in `applyLegacyAliases`. `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` are aliased.
4. They would have no way to migrate inside the container. `ririko migrate:legacy` (`apps/cli`) is in neither image.
5. Port 3000 would stop answering: the dashboard is now a separate image.

**Impact on this ticket**:
- STORY-122's compose file should reference images, not only `build:`.
- Publishing needs its own story first: CI or manual pushes of versioned tags to `ririkoai/ririkobot` (bot) and `ririkoai/ririkobot-dashboard` (web).
- Leave `latest` on 1.4.0 until that story ships a 1.4.0 upgrade path:
  - Detect a legacy `/app/data/ririko.db` and refuse to start with clear instructions, or migrate it.
  - Ship the migrate CLI in the bot image.
  - Alias `DATABASE_NAME` and `AI_SERVICE_*`.
  - Document `chown -R 10001:10001 ./data`.
- Before any 2.0 push, the maintainer should tag the current `latest` as `1.4.0` so it stays pullable by name.
- Nothing was pushed or retagged during STORY-121.
