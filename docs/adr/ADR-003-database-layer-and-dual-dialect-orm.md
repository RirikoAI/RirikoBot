# ADR-003: Explicit PostgreSQL and SQLite persistence

## Status and scope

Accepted and implemented for version-1 guild settings, actor audit, separate repositories and explicit foundation migration. Legacy import/cutover, economic transactions, durable jobs and the proposed domain catalog are not implemented by this decision. Relevant blueprint requirements: BP-05, BP-47–50, BP-55, BP-61, BP-76–78 and BP-85.

## Context and forces

The audited legacy source contains 17 entity files and 12 migrations with drift between declarations and replayed DDL. No production database was supplied. Preserving IDs, global balances, unknown settings and relationships matters more than copying an ORM abstraction. The audit does not establish that TypeORM itself caused every observed persistence defect; transport/service design and missing invariants also matter.

PostgreSQL and SQLite need common service behavior while retaining different SQL, locking, integer, JSON and migration semantics. Small self-hosted deployments should not require a PostgreSQL server merely to run the foundation. Production concurrency must not be certified from a SQLite unit test. Schema changes must be explicit so starting the bot against an old or incorrect database cannot silently rewrite it.

## Alternatives

| Option | Benefit | Cost / decision |
|---|---|---|
| Retain TypeORM and repair legacy schema in place | Less initial persistence rewrite | Requires equally careful invariant/migration work; selected modernization favors explicit SQL-oriented contracts |
| PostgreSQL only | One dialect and stronger production parity everywhere | Removes practical small local/self-hosted mode without evidence it is necessary |
| One generic Drizzle schema/query implementation for both | Less repeated code on paper | Hides differing drivers, JSON/integer types, transaction APIs and DDL; rejected |
| Separate dialect schemas/repositories with shared behavior contract | Makes differences reviewable and independently testable | Duplicate schema/migration review; chosen |
| Document database for all domains | Flexible unstructured payload storage | Core ownership, ledger and relational integrity still need explicit atomic constraints; no demonstrated need |
| Automatic schema synchronization on startup | Convenient empty-environment setup | Unsafe against unknown/legacy data; removes reviewed migration checkpoint; rejected |

## Decision

Use **Drizzle ORM 0.45.2**, `postgres` **3.4.9** with `drizzle-orm/postgres-js`, and `better-sqlite3` **13.0.3** with `drizzle-orm/better-sqlite3`. `drizzle-orm/node-postgres` pairs with `pg`, not the chosen Postgres.js client. [Official Drizzle connection guidance](https://orm.drizzle.team/docs/get-started-postgresql). Retain exact versions until a separately reviewed dependency change; current documentation examples using other releases do not update the lockfile.

PostgreSQL is the production target; SQLite is supported for development and bounded single-process deployments. Default configuration currently selects SQLite. Discord IDs stay text. The existing core `GuildSettingsStore` contract exposes get/save without a raw driver, and the application settings service owns authorization. Concrete applications create/close database connections; domain handlers do not construct pools or execute SQL.

Version 1 contains only `guild_settings`, `settings_audit` and `ririko_schema_migrations`. Fixed migration SQL is installation authority. Drizzle declarations do not currently repeat all SQL CHECK constraints. The [database guide](../database.md) catalogs exact columns, constraints, indexes and the explicitly proposed domain models.

## Transaction contract and its proof obligations

A settings save validates scope/value/revision/actor, obtains the before snapshot, conditionally writes the next revision and inserts the audit in one transaction. A stale writer conflicts; audit failure rolls back settings. SQLite uses an immediate transaction; PostgreSQL combines transaction scope with revision-qualified update or conflict-safe insert. Neither adapter performs Discord/provider calls while its transaction is open.

For future finance/ownership, a transaction must cover the entire invariant: debit, credit, fee, reservation, ownership and receipt as applicable. A ledger header plus balanced account entries is needed for double-entry behavior; before/after fields alone are insufficient. Row-local checks cannot establish a cross-row balanced total. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html). Durable request identity and reconciliation distinguish safe internal retries from ambiguous external outcomes.

Dialect behavior remains explicit. SQLite allows one writer, and immediate transactions can encounter busy contention; keeping transactions short matters because the synchronous driver blocks the calling event loop. [SQLite isolation](https://www.sqlite.org/isolation.html), [transaction behavior](https://www.sqlite.org/lang_transaction.html). PostgreSQL Read Committed does not make a multi-statement business operation serializable automatically; use the appropriate conditional writes/locks and test races. Serializable failures require whole-transaction retries. [PostgreSQL isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

The current SQLite connection enables foreign keys but does not enable WAL. A future WAL switch requires explicit checkpoint/backup/disk behavior review. PostgreSQL has a bounded pool and statement/lock/connect timeouts; timeouts are not a complete application retry policy. Future BigInt amounts require safe application arithmetic and decimal-string API serialization rather than copying current number-based revision mapping.

## Migration and data preservation

Connection/startup never migrates automatically. SQLite diagnostics preserve a missing path and initially inspect existing files read-only. Unknown or partial managed schemas are refused. PostgreSQL operates within the current schema and serializes migration with an advisory transaction lock; SQLite uses an immediate transaction. The foundation runner does not import legacy rows.

History validation checks managed object names and one matching dialect checksum row, not every live column/index/constraint. Matching history is not full drift certification. Version 2 needs an explicit runner/history/object-recognition upgrade preserving version-1 checksum; adding a table builder alone is insufficient. The old release should refuse incompatible new history rather than silently operate on it.

Legacy import uses an immutable consistent source snapshot and reviewed mapping, with durable identity independent of attempt run ID. A resumed attempt cannot mint balances/cards twice. Preserve original IDs/global economic scope, unknown rows and anomalies in protected staging; encrypt sensitive raw values. Backup and restore are separate from external-effect reconciliation. See [legacy import](../migration-1.x-to-2.0.md) and [schema migration runbook](../migrations.md).

## Consequences

Two dialects cost duplicate DDL/repository review and shared conformance tests. Typed Drizzle queries do not eliminate runtime work, runtime schema validation or driver-specific failures; no zero-overhead or universal type-safety/performance claim is made. Supporting SQLite does not promise unrestricted multi-process/high-write deployment. A measured workload can trigger a documented PostgreSQL-only feature or operating limit, but not silently degrade invariants.

The initial schema is intentionally small. The proposed catalog is a design plan, not evidence dozens of tables exist. Add constraints and indexes with the feature's real query/transaction contract. Browser/settings authorization, provider execution, media storage and database commit are separate boundaries: a database transaction cannot roll back a Discord message or atomically commit object-storage bytes.

Retention must preserve necessary ledger/ownership/replay identity while limiting private content. A user deletion cannot indiscriminately cascade through unsettled holds and evidence. No foundation cleanup worker exists, and no retention duration is implied by ORM selection.

## Acceptance and reversal gates

| Change / concern | Required evidence | Reason to revisit |
|---|---|---|
| Repository behavior | Same real-driver tests for migration, nested data, conflicts, invalid inputs and audit rollback | Dialects cannot satisfy an accepted invariant consistently |
| Schema evolution | Fresh install, v1 upgrade, unknown/history refusal, actual constraints/indexes, old-reader behavior | Runner/DDL model no longer supports reviewed incremental upgrades |
| Economic/card operations | Integer boundary, tenant mismatch, unique/FK constraints, competing mutation, rollback and idempotent replay | Chosen mapping/lock order cannot enforce conservation/ownership |
| SQLite operational mode | Busy contention, event-loop impact, disk/backup/restore and journal behavior | Measured workload exceeds declared limits or requires independent writers |
| Driver/ORM update | Pinned peer/runtime compatibility, both-dialect integration, migration checksum preservation | Security/support or required SQL behavior needs change |
| Cutover/recovery | Representative source reconciliation, protected anomalies, restore rehearsal, external delivery pause/reconciliation | Source drift or unverifiable data makes planned mapping unsafe |

Current evidence is in [shared repository tests](../../packages/database/test/settings-contract.ts), [SQLite tests](../../packages/database/test/sqlite.integration.test.ts), [PostgreSQL tests](../../packages/database/test/postgres.integration.test.ts) and [migration tests](../../packages/database/test/migrations.test.ts). See [testing](../testing.md) for exact executions. PostgreSQL cases skipped without `TEST_POSTGRES_URL` do not certify PostgreSQL support.

Reversal requires a reviewed migration/export strategy and operator restore plan, not merely replacing the driver import. Do not rewrite released migration checksums, reset repositories or run destructive repair against an unverified target. Record the failing requirement, alternative, compatibility window and tests before changing this decision. [Dependency evidence](../dependency-evaluation.md) and [legacy data manifest](../legacy-data-manifest.json) remain authoritative inputs.
