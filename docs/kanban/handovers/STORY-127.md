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
