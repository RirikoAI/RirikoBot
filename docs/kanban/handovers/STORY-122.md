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

---

## GROOMING · 2026-10-02T05:25:08Z · Claude Code (Opus 5.5)

**Approach**
- This regroom answers both STORY-121 FLAGs above. The story grows from 3 to 8 points.
- **TASK-1223 (new, 3) Postgres schema bootstrap.** This answers FLAG 1, point 1.
  - `db:generate-ddl` also writes `src/schema/pg/ddl.ts` (`PG_SCHEMA_DDL`).
  - `ensurePostgresSchema` applies it under `pg_advisory_xact_lock(1701, 1)`, and only when the schema is empty.
  - The bot (`main.ts:50`) and the dashboard (`getDatabase`, `apps/web/src/lib/server/services.ts:296`) both call it at startup, before `ensureAdventureSchema` / `ensureCardSerialSchema`.
  - `ensureCardSerialSchema` fails on an empty Postgres today, so the order matters.
- **TASK-1221 (2) probes.**
  - Bot: a `node:http` server on `HEALTH_PORT`.
  - Dashboard: route handlers under `app/api` plus rewrites.
  - Both images get a HEALTHCHECK. The images have no curl, so the HEALTHCHECK uses `node -e fetch`.
  - The smoke script checks the probes.
- **TASK-1222 (3) compose.** This answers FLAG 1, points 2 to 4, and FLAG 2.
  - Image references `ririkoai/ririkobot:${RIRIKO_VERSION}` / `ririkobot-dashboard`, with build-target fallbacks.
  - The env names the code really reads.
  - Shared named volumes for `public/cards`, `data/tcg/images`, `storage/welcomer-backgrounds` and `public/bosses`.
  - The official Lavalink 4 image with the repository's `application.yml`.
  - The uid 10001 note for bind mounts.
- Redis is dropped: no code uses it. The maintainer decided this on 2026-10-02. Remove it from `docs/deployment.md` sections 2.2 and 3 too.
- FLAG 2, Docker Hub publishing and `latest`, belongs to STORY-127. STORY-127 now requires this story.

**Relevant code**
- `packages/database/src/client/postgres.ts:6`: `createPostgresClient`, with `ping()` and no migration.
- `packages/database/src/client/sqlite.ts:43-56`: the SQLite auto-migrate pattern to copy.
- `packages/database/scripts/generate-sqlite-ddl.mjs`.
- `packages/services/src/adventure/__tests__/postgres.integration.test.ts:84-102`: the BigInt-patched `drizzle-kit export --dialect postgresql`.
- `packages/database/src/migrations/adventure-schema.ts:28` uses lock (1702, 1) and `card-serials.ts:6` uses (1703, 1). Use 1701 for the full schema.
- `apps/web/src/proxy.ts`: the matcher already skips `/api`.
- `scripts/docker-smoke.ts:340`: the web fetch runs inside the container.

**Pitfalls**
- `drizzle-kit` is a devDependency and is not in the images. Generate the DDL at build time and commit it, as with SQLite. Never generate it at runtime.
- `LAVALINK_PORT`, `LAVALINK_PASSWORD` and `LAVALINK_SECURE` are read straight from `process.env`, not through the config schema.
- The dashboard needs `SECRET_VAULT_KEY`, `DISCORD_CLIENT_SECRET` and `DASHBOARD_URL`.

**Out of scope**
- Docker Hub pushes and moving `latest` (STORY-127).
- Postgres CI (STORY-124).

---

## PROGRESS · 2026-10-02T10:00:20Z · Claude Code (Opus 5.5) · REVIEW

**Files changed**
- TASK-1223, TASK-1221 and TASK-1222 are DONE. Their notes list the files.

**Verification**
- Branch `feat/STORY-122-production-orchestration`, cut from `feat/STORY-128-guild-settings-fidelity` (PR #676), which holds the grooming. Retarget it once #676 merges.
- `pnpm lint`, `typecheck`, `build` and `test:coverage` pass: 2,676 tests; lines 70.54%, statements 69.19%, branches 58.98%, functions 71.57%.
- `docker build` of both images, then `node scripts/docker-smoke.ts bot web`: 10 of 10 pass.
- `docker compose ... config -q` passes. The end-to-end compose run on an empty Postgres passed: schema created, the web container healthy, the bot booted to Discord login.

**Answers to the STORY-121 FLAGs**
- FLAG 1:
  - The Postgres bootstrap is TASK-1223.
  - The compose env names, the shared volumes and the Lavalink image are TASK-1222.
- FLAG 2: the compose file references `ririkoai/*` images with `RIRIKO_VERSION` (default `2`), never `latest`. Publishing stays in STORY-127.

**Decisions & gotchas**
- An open FLAG on STORY-124: the existing adventure Postgres suite has one test that fails with `varchar(32)`.

---

## REVIEW · 2026-10-02T12:28:01Z · Claude Code (Opus 5.5) · DONE

**verify_cmd rerun**
- PR #676 merged into `develop/2.0.0` at 2026-10-02T12:19:39Z after CircleCI passed.
- Rerun on `develop/2.0.0` (`4217150`): `pnpm build`, `pnpm typecheck`, `pnpm lint --quiet` pass; `pnpm vitest run packages/database/src apps/bot/src apps/web/src scripts` passes 115 files, 916 tests, 1 skipped; `docker compose -f docker-compose.production.yml config -q` passes.

**Acceptance**
- [x] TASK-1223: an empty Postgres database gets the full 2.0 schema at bot or dashboard startup, safely when both start at once.
- [x] TASK-1221: bot and dashboard answer /health and /ready, and both images have a HEALTHCHECK.
- [x] TASK-1222: docker-compose.production.yml runs Postgres, Lavalink, bot and dashboard with the real env names and shared volumes, and docs/deployment.md matches it.
