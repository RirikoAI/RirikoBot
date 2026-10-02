# Handover Notes: STORY-126 1.4.0 Upgrade Path: Real-Schema Fixture & Automatic Migration From a Read-Only Legacy Mount

<!--
Append-only log. Add new entries at the bottom. Never delete earlier entries.
Entry types: GROOMING (coordinator), PROGRESS (worker), REVIEW (coordinator), FLAG (any agent, about this ticket).
See docs/kanban/protocol.md section 6.
-->

---

## GROOMING · 2026-10-01T16:10:59Z · Claude Code (Opus 5.5)

**Approach**
- The maintainer wants to sunset 1.4.0 entirely. About 1.1k people pulled `ririkoai/ririkobot:latest` (1.4.0). The legacy compose file tells them to run it as root with `./data:/app/data` and `DATABASE_NAME=/app/data/ririko.db`.
- The migration strategy has two halves:
  - **This story:** mount the old folder read-only next to a new 2.0 volume, and migrate automatically on first boot.
    ```yaml
    volumes:
      - ririko_data:/app/data      # new 2.0 data, owned by uid 10001
      - ./data:/app/legacy:ro      # untouched 1.4.0 data
    ```
  - **STORY-127:** env aliases, a fail-fast message for the old layout, the upgrade guide, Docker Hub tags, and moving `latest`.
- Decided with the maintainer on 2026-10-02:
  1. Migration is automatic on first boot when a legacy database is found and has not been migrated yet. A dry-run and manual command is also provided.
  2. A user who pulls 2.0 with the old compose (a root-owned `./data` mounted read-write at `/app/data`) gets an exit with instructions, not a root entrypoint. The images stay rootless (STORY-127 task 1).
  3. Pulling `ririkoai/ririkobot:latest` locally to extract the real 1.4.0 schema is approved. Nothing gets pushed.
- Order: TASK-1261 (real-schema fixture and transformer fixes), then TASK-1262 (the startup upgrade step, the manual command, the image env and the smoke check).
- This branch is `feat/STORY-126-legacy-upgrade`, cut from `feat/STORY-121-rootless-docker` (PR #674), because TASK-1262 changes the Dockerfile and the smoke script. Retarget or rebase onto `develop/2.0.0` once #674 merges.

**Relevant code** (from CodeGraph during grooming)
- The migration pieces already exist:
  - `packages/database/src/migration/engine.ts:36` `MigrationEngine.migrate`: inspects the source, transforms it, and inserts everything in one `withTransaction` with `onConflictDoNothing`. It reports `coinsConserved`, but it does not refuse to run when that is false.
  - `packages/database/src/migration/inspector.ts:15` `LegacySqliteInspector.open`: `readonly: true, fileMustExist: true`.
  - `packages/database/src/migration/transformer.ts:52` `LegacyTransformer.transform`: maps 17 legacy entities.
  - `apps/cli/src/commands/migrate.ts`: `migrate:legacy` and `migrate:verify`. The CLI is not in the images. `migrate:rollback` is in `docs/migrations.md` section 3.4 but not implemented.
- `packages/database/src/migration/migration.test.ts:20`: the legacy schema is hand-written, which is what TASK-1261 replaces.
- `apps/bot/src/services.ts` `createBotServices` seeds the shop catalog (`seedDefaultCatalog`, line 404), achievements (line 923) and TCG canonical items (line 951) into the target. The legacy migration must run before that.

**Pitfalls**
- **Zero legacy mutation:** the bot never opens or writes the legacy path. Copy it to a temporary directory first. A read-only mount with a hot journal can also fail a plain read-only open, and copying avoids that too.
- **`.local/RirikoBot` is read-only.** Read its entities and TypeORM migrations; never edit them.
- 1.4.0 could also run on Postgres (`DATABASE_TYPE`), but the Docker image and compose used `better-sqlite3`. This story covers the SQLite source only. The target may be SQLite or Postgres.

**Out of scope**
- Everything in STORY-127: aliases, the old-layout message, docs and the guide, Docker Hub, and `latest`.
- `migrate:rollback`. Going back is done by running 1.4.0 again on the untouched folder.
