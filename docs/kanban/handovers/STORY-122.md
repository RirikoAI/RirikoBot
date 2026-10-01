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
