# Schema migrations

This document describes the **implemented version-1 foundation migrator** and the requirements for evolving it. It is not a legacy importer or a universal migration framework. [migration-1.x-to-2.0.md](migration-1.x-to-2.0.md) governs legacy source capture, field mapping, giveaways, reconciliation and cutover. [database.md](database.md) specifies persistence contracts and schema status.

## Current operator workflow

Use the Node/pnpm versions and environment procedure in [development.md](development.md). Run from the repository root and inspect the intended `DATABASE_DIALECT`/`DATABASE_URL` without exposing credentials. Choose a separate new 2.0 database or an existing verified foundation database, never a legacy deployment file.

```sh
pnpm ririko migrate:status
pnpm ririko migrate
pnpm ririko migrate:status
pnpm ririko health
```

`migrate:status` emits `{ "current": 0, "latest": 1 }` for an empty target or missing SQLite file; it does not initialize it. `migrate` explicitly creates/applies the foundation schema. Successful repeated application is a no-op, and status becomes `{ "current": 1, "latest": 1 }`. `health` requires a migrated schema and probes the database; it does not test Discord connectivity. Handled CLI failures return exit 1 and a safe error message. Unexpected driver errors are redacted rather than included in public output.

The CLI's `migrate` accepts no extra arguments. `migrate:status` currently ignores surplus arguments; this does not create a supported option. Neither operation uses the settings CLI's `BOT_OWNER_IDS` actor convention: migration authorization is host/database access. Startup and doctor never call `migrate`. Startup refuses a missing/pending schema before normal operation. These are local operator actions without Discord slash/prefix equivalents.

There is no implemented `migrate:legacy`, `migrate:verify`, `migrate:rollback`, `db:backup`, `db:restore` or migration generator. Planned interfaces in the legacy runbook remain proposals. There is no automatically invoked TypeORM synchronization or seed conversion.

## Installed schema and checksum authority

Fixed statements in [migrations.ts](../packages/database/src/migrations.ts) are the authority for installed version 1. The Drizzle schema builders describe runtime mappings; they are not executed as a schema-sync mechanism. Some revision CHECK constraints exist in migration SQL rather than the current Drizzle builders. Inspect both when proposing a change and never regenerate a supposedly identical schema without comparing constraints.

| Object | Stored fields and invariants |
|---|---|
| `ririko_schema_migrations` | `version INTEGER PRIMARY KEY`, non-null `checksum`, non-null text `applied_at`; exactly one accepted version-1 row today |
| `guild_settings` | Text guild ID primary key; non-null prefix/module/command values; revision checked between 1 and 9007199254740990 |
| `settings_audit` | Text audit ID primary key; guild FK to settings; actor; before/after revision; nullable before snapshot; required after snapshot/time; before revision >=0 and after revision exactly before+1 |
| `settings_audit_guild_revision` | Unique index on `(guild_id, after_revision)`; prevents two audit events claiming the same settings revision |

SQLite stores module/command/snapshot JSON as TEXT and revisions as INTEGER. PostgreSQL uses JSONB and BIGINT. The statement text therefore differs by dialect. `migrationChecksum(dialect)` computes SHA-256 over the fixed statement array joined with one newline; even a statement-text change can alter history compatibility. Checksums are not interchangeable between dialects.

`verifyHistory` currently accepts **exactly one row**, version 1, with that dialect's expected checksum. An empty ledger, extra version, future version, changed checksum or opposite-dialect checksum is invalid. It is not an ordered upgrade runner yet. Applied timestamps are recorded but not used as a data-integrity proof.

### What status detects and what it does not

| Observed target state | Current behavior |
|---|---|
| Missing SQLite path | Status 0/1 without creating the path or parent directories |
| No inspected application objects | Status 0/1; explicit migrate may initialize |
| All three expected managed names plus valid history | Status 1/1 |
| Any inspected name outside managed set | `FOREIGN_SCHEMA`; no foundation additions alongside it |
| Only some managed names | `SCHEMA_INVALID`; no automatic completion of missing tables |
| Missing/modified/future/incompatible history | `SCHEMA_INVALID`; no automatic ledger repair |
| Expected names/history but altered columns/indexes/constraints | Not comprehensively detected by status; subsequent operations may fail or constraints may be absent |

SQLite inspects non-internal tables, views and triggers from `sqlite_master`, excluding names beginning `sqlite_`; it does not inventory indexes in that guard. PostgreSQL inspects ordinary/partitioned/foreign tables, views and materialized views in `current_schema()`. It does not inspect every database schema, function, trigger or index. The checksum validates expected migration text against history, not the full live DDL. Therefore green status is **not a full schema fingerprint, tamper detector or backup verification**.

For incidents or import preflight, independently compare catalog columns/types/defaults/indexes/FKs/checks against the release's fixed SQL. Do not insert a matching ledger row to make an unknown database appear compatible. PostgreSQL search-path/current-schema configuration matters: resolve the intended schema rather than assuming all tables are in `public`.

## Atomicity and locking by driver

### SQLite

[sqlite.ts](../packages/database/src/sqlite.ts) constructs a lazy connection. Existing files are initially opened read-only; reads cannot create a missing file. `migrate` checks status before opening for creation/write, then checks it again inside an **immediate transaction**. All version-1 statements and the ledger insert commit together. Foreign keys are enabled on connection open, and the driver busy timeout is 5000 ms.

The inside-transaction recheck prevents another completed migration from being applied twice. A competing writer may cause a busy/lock failure; retry only after identifying the owner and rereading status. This short schema transaction is distinct from the proposed long-running import. The current connection does not explicitly select WAL mode; do not claim every deployment already uses WAL.

A failed uncommitted schema transaction rolls back its DDL/history. Directory creation and opening a new SQLite file happen outside that transaction, so an empty file/directory may remain. Preserve and inspect it; do not describe rollback as restoring every filesystem byte. A read-only rejection of an existing foreign database is covered by an unchanged-file-hash test, which is narrower evidence than every possible filesystem/crash condition.

### PostgreSQL

[postgres.ts](../packages/database/src/postgres.ts) begins a transaction, obtains `pg_advisory_xact_lock(hashtext(current_database()), hashtext(current_schema()))`, checks status, executes the fixed DDL and inserts history within that transaction. The lock is scoped to that database/schema key and released at transaction completion. Advisory locking coordinates participants following this protocol; it does not prevent an unrelated administrator from issuing DDL. PostgreSQL distinguishes advisory locks from automatically acquired table/row locks. [Official locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).

The client configures a pool maximum of 5, connection timeout 10 seconds, idle timeout 20 seconds, and statement/lock timeouts of 5000 ms. These are current client settings, not migration throughput guarantees. Long or contended DDL can time out; record the error and inspect the transaction's outcome rather than globally disabling limits. The driver begins/commits or rolls back the DDL/history together. Fixed application SQL passed through `unsafe` is not permission to interpolate user-supplied statements.

### Crash and retry decisions

| Failure window | Expected durable state | Recovery decision |
|---|---|---|
| Before writable SQLite open / PostgreSQL transaction | No migration mutation | Reconfirm target/configuration and retry after correcting the cause |
| After new SQLite file creation, before commit | File may exist; schema transaction incomplete/rolled back | Inspect 0/1 status and actual schema; never assume file existence means initialized |
| During DDL or ledger insertion | Transaction rolls back uncommitted work | Reread status and inspect schema if abnormal; do not fill partial managed objects manually |
| Server committed but client lost response | Outcome uncertain to the client | Query status on a fresh connection; a verified 1/1 is rerunnable without another schema creation |
| Another migrator holds the lock | Bounded wait may fail | Identify active operator, wait/coordinate, then reread before retry |
| Disk/database corruption or altered catalog | Transaction atomicity is insufficient | Freeze writes, retain evidence and restore a verified backup through a reviewed recovery plan |

No transaction can reverse an external action or repair arbitrary storage corruption. Schema migration performs no Discord/provider sends. A later data importer must preserve that separation.

## Add a schema version: required future implementation

A version-2 change needs an estimated ticket, database contract review and both-dialect verification before any application consumer uses it. Do not modify released version-1 text/checksums to make new tests pass.

1. **Specify the change.** Describe existing rows, desired fields, null/default semantics, constraints/indexes, expected volume and compatibility with old/new binaries. Identify transformations that can reject existing data.
2. **Extend history deliberately.** Replace the one-version check with ordered immutable migrations. Verify every applied checksum, reject gaps/duplicates/future versions, and apply only the supported suffix. Preserve a clear compatibility floor for startup.
3. **Choose an upgrade strategy.** Prefer additive expansion before backfill and constraint tightening when old/new code may overlap. Destructive drops or renames need a reviewed compatibility window and backup. Separate large backfills from a single startup transaction; no automatic product deployment is authorized by adding a migration.
4. **Design both dialect paths.** Review SQLite rebuild/locking and PostgreSQL DDL requirements. Some operations cannot be handled by the same transactional runner; declare such boundaries and recovery explicitly instead of claiming every DDL operation is interchangeable.
5. **Keep schema definitions aligned.** Update fixed migration SQL and Drizzle mappings together; test the installed catalog, including constraints absent from schema builders, against the intended contract.
6. **Verify with populated prior schemas.** Exercise upgrade, rerun, interruption, checksum drift, wrong/future versions, concurrent migration and settings/audit preservation on both drivers. Validate round-trip JSON, numeric range and foreign keys.
7. **Document operation and restoration.** State required privileges, expected locks, measured duration, storage headroom, verification queries and binary/schema compatibility. Restore only a verified snapshot; preserve later writes through an explicit recovery plan. There is no generic automatic down-migration command.

Candidate acceptance cases for the future runner include a valid 1→2 upgrade, rejection of a forged version-1 checksum, no version-3 downgrade, rollback of a deliberately failing version-2 statement, independent two-client concurrency and restart after a commit whose acknowledgement was lost. These are required future tests, not claims about current coverage.

## Verification evidence and operational limits

Existing [migration guard tests](../packages/database/test/migrations.test.ts) cover empty/complete/foreign names, incompatible history and revision overflow. The shared [settings contract](../packages/database/test/settings-contract.ts) covers explicit/idempotent migration, persistence/audit, concurrent settings creation, stale updates and validation. [SQLite integration tests](../packages/database/test/sqlite.integration.test.ts) add missing-path noncreation, reopen, foreign-file hash preservation, checksum tampering, incomplete-schema refusal, audit failure rollback and isolated memory databases. [PostgreSQL integration tests](../packages/database/test/postgres.integration.test.ts) run the shared contract plus foreign-schema refusal and audit rollback when `TEST_POSTGRES_URL` is supplied.

These source-backed cases do not establish migration crash injection, full catalog fingerprint detection, future-version upgrades, legacy import, backup restoration or live production readiness. Do not confuse concurrent settings tests with independent concurrent migration tests. [testing.md](testing.md) records executed results and skips; this documentation review does not invent a fresh run.

Use [the legacy runbook](migration-1.x-to-2.0.md) before touching operator data. Capture a consistent source and target backup, test restoration in isolation and keep external workers stopped during migration verification. A schema-ready database can still be empty of all legacy users, balances, playlists and giveaways.
