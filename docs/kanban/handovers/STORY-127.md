# Handover Notes: STORY-127 Docker Hub Release of 2.0 Images & 1.4.0 Sunset

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-02T05:25:08Z · Claude Code (Opus 5.5)

**Approach**
- This story follows the plan in the STORY-126 grooming and the STORY-121 Docker Hub FLAG (see `STORY-122.md`). It now also requires STORY-122, so the first 2.x release ships with the probes and the production compose file.
- **TASK-1271 (2): env aliases and fail-fast.**
  - Add three aliases to `applyLegacyAliases` (`packages/core/src/config/schema.ts:116`):
    - `AI_SERVICE_TYPE` to `DEFAULT_AI_PROVIDER`.
    - `AI_SERVICE_DEFAULT_MODEL` to `DEFAULT_AI_MODEL`.
    - `AI_SERVICE_API_KEY` to the provider key that matches the type.
  - `DATABASE_NAME` is deliberately not aliased. It would make the 1.4.0 file the 2.0 database. Its presence triggers the old-layout fail-fast instead.
  - The bot prints the upgrade steps and exits before it touches any file when any of these is true:
    - `DATABASE_NAME` is set.
    - A `ririko.db` is in the 2.0 data directory.
    - The data directory is not writable.
- **TASK-1272 (2): docs.**
  - `docs/upgrading-from-1.4.md`.
  - The Docker Hub descriptions in `docs/dockerhub/`.
  - Links from `docs/migrations.md` section 4 and from `docs/deployment.md`.
- **TASK-1273 (3): release workflow.**
  - Runs on `vX.Y.Z` tags only.
  - Builds both images, smokes them, then pushes `X.Y.Z`, `X.Y` and `X`. It never pushes `latest`.
  - Docker Hub credentials come from a CircleCI context named `dockerhub`, which the maintainer creates.
- **TASK-1274 (1): runbook.** `docs/release.md` holds the maintainer-only sunset steps:
  1. Retag the current `latest` as `1.4.0`.
  2. Announce the sunset.
  3. Move `latest` after the announced period.

**Relevant code**
- `packages/core/src/config/schema.ts:116-141`: the current aliases. `main.ts` and `services.ts` read `process.env` directly, so the aliases must also apply on that path.
- `apps/bot/src/main.ts:50-51`: the place for the fail-fast, before `runLegacyUpgrade`.
- `packages/database/src/client/sqlite.ts:10` `resolveDatabasePath`.
- `scripts/docker-smoke.ts:285-325`: the legacy smoke case to copy for the old-layout case.

**Pitfalls**
- Agents never push, retag or log in to Docker Hub. Only the maintainer does that.
- The images stay rootless. The maintainer decided this in STORY-126.

**Out of scope**
- Moving `latest`. That is a maintainer action after the announced period.

---

## GROOMING · 2026-10-02T15:41:07Z · Claude Code (Opus 5.5)

Refresh after STORY-124 closed. Every `requires` story is DONE, so the story and all four tasks move to TODO. The approach in the first GROOMING entry stands. These corrections apply:

**Relevant code**
- `applyLegacyAliases` is now at `packages/core/src/config/schema.ts:118-143`.
- In `apps/bot/src/main.ts`, the fail-fast must run before `createDatabaseClient` (line 52) and before the health server starts, not only before `runLegacyUpgrade`. `createSqliteClient` creates the data directory and opens the file, so a check after it would already touch files.
- `main.ts:32-33` reads `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` directly, and `services.ts` reads the AI keys from `process.env`. Export the alias function from `@ririko/core` and apply it to `process.env` once at the top of `main`. Do not copy the alias rules.

**Pitfalls**
- Derive the data directory from the configured SQLite URL with `resolveDatabasePath`. Skip the file checks for Postgres and `:memory:`.

---

## REVIEW · 2026-10-02T16:24:11Z · Claude Code (Opus 5.5) · DONE

**Checks**
- I ran the story verify_cmd on `feat/STORY-127-dockerhub-release` (not committed): `pnpm build`, `pnpm typecheck`, `pnpm vitest run packages/core/src apps/bot/src scripts` (71 files, 690 tests), `pnpm lint --quiet`. All pass.
- `pnpm format:check` passes.
- `pnpm test:coverage` passes: 2707 tests, and every threshold holds.
- The bot image smoke run passed 7 of 7 checks in TASK-1271.

**Acceptance**
- [x] TASK-1271: the 1.4.0 env names work, and the old compose layout stops with the upgrade steps.
- [x] TASK-1272: `docs/upgrading-from-1.4.md` and `docs/dockerhub/` exist.
- [x] TASK-1273: a `vX.Y.Z` tag builds, smokes and pushes versioned images, never `latest`.
- [x] TASK-1274: `docs/release.md` is the maintainer's sunset runbook.

**Follow-up**
- The release workflow has not run yet. Its first run is the maintainer's first tag (docs/release.md section 4).
- The 1.4.0 migration does not support a Postgres target (migrations.md 4.3), so 1.4.0 users upgrade on SQLite. Supporting Postgres targets would be a new ticket.
