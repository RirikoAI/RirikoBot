# ADR-003: Explicit PostgreSQL and SQLite persistence

## Status

Accepted and implemented for the foundation settings schema, repositories and explicit schema migration. Legacy import/cutover and future domain tables are not implemented by this decision.

## Problem

The audited legacy source contains 17 entity files and 12 migrations with schema drift and several persistence risks. No production source database was supplied. PostgreSQL and SQLite must share service contracts while preserving their different SQL, locking, transaction, integer and JSON behavior. There is no evidence supporting blanket claims that the old ORM itself caused every observed defect.

## Options considered

- Continue TypeORM and repair the legacy schema in place.
- Adopt Drizzle with one attempted generic SQL/schema implementation.
- Adopt Drizzle with separate dialect schemas, migrations and repositories behind common contracts.

## Decision

Use **Drizzle ORM 0.45.2** with explicit, separately reviewed PostgreSQL and SQLite implementations. Pair **Postgres.js (`postgres`)** with **`drizzle-orm/postgres-js`**. Pair **`better-sqlite3`** with **`drizzle-orm/better-sqlite3`**. The `node-postgres` adapter belongs to the different `pg` driver and is not the selected pairing.

PostgreSQL is the production target; SQLite is supported for development and bounded single-process deployments. Keep the common `GuildSettingsStore` contract in core. The current managed schema contains `guild_settings`, `settings_audit` and schema migration history. Settings changes use revision comparison and an audit record in one transaction. Migrations are explicit, checksum-verified operations; connecting or starting the bot must not silently mutate an unknown/legacy schema.

Add economy, jobs, cards and other domain tables only with their contracts, constraints and tests. Legacy migration must use a consistent read-only source backup, preserve original identity/raw data as required, and report discrepancies. Foundation schema creation is not a legacy importer.

## Consequences

Separate SQL implementations require duplicate schema/migration review and shared conformance tests. Drizzle provides typed query construction; it does not eliminate runtime overhead, data-validation needs or dialect differences. SQLite's synchronous driver can block the event loop, so transactions must stay short. Financial/trade guarantees depend on concrete constraints, atomic operations and concurrency tests, not an ORM choice alone.

## Validation and evidence

Run repository/migration behavior against both dialects, including conflicts, transaction rollback, history mismatch and unknown-schema refusal. Skipped PostgreSQL tests are not PostgreSQL certification. Production cutover additionally requires representative source-data verification, backup/restore rehearsal and operator review. See [data manifest](../legacy-data-manifest.json), [migration plan](../migration-1.x-to-2.0.md), and [dependency evaluation](../dependency-evaluation.md).
