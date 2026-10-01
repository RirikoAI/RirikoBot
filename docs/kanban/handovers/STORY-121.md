# Handover Notes: STORY-121 Rootless Dockerfile & Containerization

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-01T15:01:55Z · Claude Code (Opus 5.5)

**Approach**
- Re-estimated from 5 to 8 points. The user chose to add TASK-1213, a CircleCI job that builds both images, so the Dockerfile cannot break unnoticed. The tasks are TASK-1212 3, TASK-1211 3 and TASK-1213 2.
  - TASK-1211 went from 2 to 3: `next start` must run from a production-only install, and whether `next.config.ts` loads there is unproven.
  - TASK-1213 is 2: the smoke checks must work on CircleCI's remote Docker engine, and only the PR run can prove that.
- Use one root `Dockerfile` with shared stages and two runner targets, `bot-runner` and `web-runner`. The compose sketch in `docs/deployment.md` section 2.2 already names these targets.
- Order:
  1. TASK-1212 (bot): lays the shared stages, `.dockerignore` and `scripts/docker-smoke.ts`.
  2. TASK-1211 (web): adds the web target on those stages.
  3. TASK-1213: runs both builds and the smoke script in CircleCI.
- Both images keep the monorepo layout at `/app`, with `pnpm-workspace.yaml` present. `findWorkspaceRoot` then resolves `assets/`, `data/`, `public/cards`, `public/bosses` and `storage/` as it does in development. No code changes are needed.
- Both images run as uid/gid 10001 (user `ririko`). App files stay owned by root. Only the data directories are owned by 10001.

**Relevant code** (from CodeGraph during grooming)
- `packages/core/src/config/paths.ts:10` `findWorkspaceRoot`: walks up to `pnpm-workspace.yaml` or `.git`, otherwise falls back to cwd.
- `packages/database/src/client/sqlite.ts:17` `createSqliteClient`: creates the parent directory and auto-migrates a file database. The default `DATABASE_URL` is `./data/ririko.sqlite`.
- `packages/services/src/welcomer/background-store.ts:16` `WELCOMER_BACKGROUND_DIR`: the bot and the dashboard both write it.
- `packages/services/src/waifu-tcg/canvas/card-image.service.ts:10` `RENDERED_CARDS_DIR` (`public/cards`): a render cache the bot and the dashboard both write.
- `packages/music/src/player/music-player.service.ts:670`: `StreamType.Arbitrary` makes `@discordjs/voice` spawn FFmpeg.

**Pitfalls**
- No compilers are needed:
  - `better-sqlite3@13` ships N-API prebuilds for linux-x64 glibc and has no install script.
  - `@napi-rs/canvas` and `@snazzah/davey` install per-platform optional packages.
  - `opusscript` is WASM.
- `pnpm start:bot` passes `--env-file=../../.env`, which fails when `.env` is missing. Run `node apps/bot/dist/main.js` directly.
- The private music package (`packages/music-private`) never goes into the build context or an image. Docs use neutral wording.

**Out of scope**
- These belong to STORY-122:
  - `docker-compose.production.yml`.
  - `/health` and `/ready`, and a Dockerfile `HEALTHCHECK`.
  - The Lavalink container.
  - The Postgres schema bootstrap (see the FLAG in `STORY-122.md`).
- Publishing images to a registry.
- Next.js `output: 'standalone'`.
- Moving to Node 24 (CI and `engines` use Node 22).
