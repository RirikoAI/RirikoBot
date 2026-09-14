# Database foundation

The implemented database scope is guild settings and their actor audit. Economy, notes, playlists and other domain tables remain planned; see [the implementation roadmap](implementation-roadmap.md) and [legacy migration design](migration-1.x-to-2.0.md).

`packages/database` uses Drizzle ORM with separate SQLite (`better-sqlite3`) and PostgreSQL (`postgres-js`) schemas and repositories. Both implement the `GuildSettingsStore` contract from `packages/core`. Domain/transport code receives the contract instead of a raw SQL client. Discord IDs stay strings.

## Connection and readiness

Set `DATABASE_DIALECT=sqlite` with `DATABASE_URL=data/ririko.db`, or `DATABASE_DIALECT=postgres` with a PostgreSQL connection URI. SQLite also accepts `:memory:` for tests. Keep credentials out of command-line arguments and logs.

`connectDatabase()` returns settings access, `migrate()`, `migrationStatus()`, `healthCheck()` and `close()`. It does not migrate. SQLite diagnostics do not create a missing file or its parent directory; creation occurs only during explicit migration. Existing files are first opened read-only for schema inspection. A writable handle is opened only for a recognized settings write or an explicit empty-database migration. No startup journal-mode change is performed.

PostgreSQL uses the connection's current schema, normally `public`; use a dedicated database/schema. Existing unrecognized tables/views cause a refusal. Connections have a ten-second connect timeout and five-second statement/lock timeouts. The test suite isolates each PostgreSQL test using a unique `search_path` schema. Startup readiness requires a current, matching migration history; an empty database reports migration required.

## Stored records

| Table | Role |
|---|---|
| `guild_settings` | Guild ID, prefix, module flags, command policies and revision. Nested policy data is JSON text on SQLite and JSONB on PostgreSQL. |
| `settings_audit` | UUID, guild/actor IDs, before/after revision and full settings snapshots, UTC ISO timestamp. One audit row per guild revision. |
| `ririko_schema_migrations` | Applied schema version, dialect-specific SHA-256 checksum and timestamp. Separate from future legacy import history. |

An absent settings record returns `undefined`; `SettingsService` supplies validated defaults at revision zero. First save expects zero and returns one. Updates include the expected revision in the database predicate. A stale or competing writer receives `AppError('CONFLICT', 'Settings changed; reload and retry.')`, preventing silent overwrites from another bot, CLI or future dashboard.

Settings and the actor audit insert commit in one transaction. SQLite uses an immediate transaction; PostgreSQL uses an insert/update with a revision predicate inside a transaction. An audit failure rolls back the setting change. The store validates input and snapshots, and increments revisions without exceeding the safe integer range. Transport authorization belongs to the shared settings service; a repository is not an authentication boundary.

## Validation evidence

The same integration contract covers explicit migration, nested settings, audit snapshots, concurrent creation/update and invalid inputs on both dialects. SQLite additionally covers restart persistence, missing-path diagnostics, legacy database byte preservation, checksum mismatch, in-memory isolation and transaction rollback when audit insertion fails.

Run `pnpm test` and `pnpm test:integration`. PostgreSQL cases require `TEST_POSTGRES_URL` pointing to a test database where the test role can create/drop its own schemas. When absent, they are explicitly skipped; a SQLite pass is not PostgreSQL certification. CI/release must run against real PostgreSQL before claiming support verified.
