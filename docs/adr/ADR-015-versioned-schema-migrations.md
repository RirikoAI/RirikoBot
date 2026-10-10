# ADR-015: Versioned, Forward-Only Schema Migrations Applied by the Application

## Status
Proposed (2026-10-10, EPIC-019 grooming). It becomes Accepted when STORY-185 is done.

## Context
Until EPIC-019, the schema reached a database in three ways:

- **Empty database:** the generated full DDL (`SQLITE_SCHEMA_DDL`, `PG_SCHEMA_DDL`) runs at startup (`createSqliteClient`, `ensurePostgresSchema`).
- **Some later changes:** hand-written, repeatable `ensure*` upgrades (`ensureTextIdColumns`, `ensureAdventureSchema`, `ensureCardSerialSchema`, `ensureGuildRegistrySchema`) run at startup.
- **Every other change:** a handover note says "existing databases need `pnpm db:push`". Examples are `guild_welcomer.background_file`, `free_game_channels.mention_role_id` and the `tcg_*` settings on `guild_settings`.

This does not work for an open-source bot that others host, nor for the public Ririko bot:

- The production images have no `drizzle-kit`, so `db:push` cannot run there. `drizzle-kit push` can also stop to ask questions or drop data. **`db:push` never runs against staging or production.**
- Nothing records which upgrades a database has had. A database created before a "needs `db:push`" change stays behind without any error, until a query fails.
- An older image can start on a newer schema without any check.
- Every schema ticket depends on someone remembering a manual step (TASK-1333 was groomed with one).

**Who runs Ririko:**
- Self-hosters on SQLite or PostgreSQL who upgrade with `docker compose pull && docker compose up -d`. They skip versions and do not read release notes.
- The maintainer's staging host. It is the only long-lived 2.0 database (members test the bot in their servers).
- The public production bot, still to come. Its migrations must be controlled, automated and safeguarded.

## Decision
1. **Migrations are versioned SQL files, one ordered list per dialect.**
   - Files: `packages/database/migrations/pg/` and `packages/database/migrations/sqlite/`, named `NNNN_<slug>.sql`.
   - Authored with `drizzle-kit generate` from the two Drizzle schemas, with one config file per dialect.
   - Committed and reviewed like code. A migration may be edited before release, for example to add a data backfill. After a release it never changes.
2. **They are embedded in code.** A generator, like `db:generate-ddl` today, writes the files into TypeScript modules: an ordered list of `{ id, sql, checksum }`. The bot, the CLI and the dashboard bundle then read no migration files at runtime, and the images need no extra `COPY`.
3. **Our own small runner applies them: `migrateDatabase(client)`.**
   - Tracking table `ririko_schema_migrations` (`id`, `checksum`, `applied_at`), in the connection's current schema.
   - Applies by `id`, in order, each migration in its own transaction.
     - We do not use Drizzle's runtime migrator. It decides by timestamp, so a migration merged from an older branch is skipped without error.
     - It also puts its table in a `drizzle` schema and takes no lock.
   - PostgreSQL: a session advisory lock is held for the whole run, so the bot and the CLI never migrate at the same time.
   - SQLite: when migrations are pending on an existing file database, the runner first writes a backup with `VACUUM INTO`, next to the database. It keeps the newest five.
   - An applied migration whose checksum no longer matches stops the run. The message names the file.
4. **Fresh databases** run every migration from `0000`. The generated full DDL stays only as a fast fixture for tests, and a parity test keeps it equal to what the migrations produce.
5. **Existing databases are adopted once.**
   - `0000_baseline` is the schema at adoption time.
   - A database with tables but no tracking table gets the old repairs (`ensureTextIdColumns`, the card serial audit). Then it is reconciled with the baseline, additively:
     - missing tables and indexes are created;
     - missing columns that are nullable or have a default are added;
     - anything else (a missing NOT NULL column with no default, a type mismatch) refuses the adoption, with a report and no change.
   - After that, `0000` is recorded as applied. This also repairs every past "needs `db:push`" drift.
6. **Who applies migrations.**
   - The bot at startup, unless `DB_AUTO_MIGRATE=false`.
   - The CLI: `ririko db:migrate`, with `--status` and `--dry-run`.
   - `ririko db:copy`, on its target.
   - The dashboard **never** migrates. At startup it reads the migration status. `/api/ready` stays 503, with a clear log line, while the database is behind the dashboard's own list. Only one writer ever changes the schema.
7. **Compatibility rule: expand, then contract.**
   - A migration must leave the schema usable by the previous release. Only additions are allowed: tables, nullable or defaulted columns, indexes, backfills.
   - Exception: a migration whose first line is `-- ririko:contract`. It may drop or rename only what the previous release no longer reads.
   - A safety lint in CI fails on destructive statements (`DROP TABLE`, `DROP COLUMN`, `RENAME`, `ALTER COLUMN ... TYPE`, `SET NOT NULL`) in a migration without the marker.
8. **Downgrade guard.** An image that finds applied migrations it does not know:
   - starts with a warning when all of them are ordinary (expand) migrations, so rolling back to the previous release works;
   - refuses to start when any of them is a contract migration. The message says to restore the pre-deploy dump or to deploy the newer release.
9. **Production and staging.** The host deploy:
   - takes its pre-deploy dump;
   - runs `ririko db:migrate` once, from the new image, before starting the new containers;
   - aborts if the migration fails. The old release keeps running on an unchanged database, because PostgreSQL DDL is transactional.

   The production compose file sets `DB_AUTO_MIGRATE=false`, so the deploy step is the only writer of the schema there. Self-hosters keep migrate-on-start.
10. **CI gates**, on both dialects:
    - `drizzle-kit generate` finds no change: no schema change ships without its migration.
    - The embedded modules match the SQL files.
    - Migrations on an empty database produce exactly the schema.
    - A staging-shaped old database adopts the baseline and migrates.
    - The safety lint passes.

## Consequences
### Positive
- A schema change is a reviewed file, and CI rejects one that is missing. No manual step exists on any host.
- Self-hosters upgrade across any number of versions with no action.
- Staging and production have a gated migration step, a pre-deploy dump and a defined rollback.

### Negative
- One more generated artifact to keep in sync. The CI gate enforces it.
- Renames and drops take two releases.
- Forward-only: undoing a migration means restoring a backup, not running a down migration. This matches most self-hosted projects (Gitea, Umami, Outline) and keeps SQLite simple.

## Rejected Options
- **`drizzle-kit push` in production:** it needs dev dependencies, can prompt, can drop data and keeps no history.
- **Drizzle's runtime migrator:** it skips migrations by timestamp, has no lock, and uses a fixed `drizzle` schema (see Decision 3).
- **Keep hand-written `ensure*` upgrades:** no history, no downgrade guard, and every change depends on someone remembering it.
- **Down migrations:** rarely tested and unsafe on SQLite. The pre-deploy dump and the SQLite backup cover recovery.
