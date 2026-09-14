# Schema migrations

Schema migration is explicit:

```sh
pnpm ririko migrate:status
pnpm ririko migrate
pnpm ririko health
```

These commands configure the database selected by `DATABASE_DIALECT` and `DATABASE_URL`. They do not import 1.x data. `migrate` refuses unrecognized/legacy database objects instead of adding foundation tables alongside old data. Use a separate target for 2.0.

The current release contains schema version 1 in `packages/database/src/migrations.ts`: guild settings, settings audit and the migration ledger. SQL is a fixed application-defined set of statements; user values are always parameters. The exact statements are hashed separately for SQLite and PostgreSQL. A missing, changed or future ledger fails validation and is never auto-repaired.

SQLite runs all migration statements and the ledger insert in one immediate transaction. PostgreSQL uses a transaction-scoped advisory lock keyed by database/current schema, then applies DDL and the ledger entry together. Re-running a successfully applied migration is a no-op. A failed uncommitted migration rolls back its schema operations. Startup and doctor never call migrate.

## Adding a schema version

1. Review the domain contract, architecture and database agent instructions. Preserve existing data semantics and review both dialect definitions before consumers change.
2. Add a new immutable version rather than editing released version-1 SQL. Extend the current one-version runner into an ordered migration list with checksum verification for every applied version and detection of gaps/future versions.
3. Add SQLite and PostgreSQL statements and corresponding Drizzle schemas. Document nullability, defaults, new uniqueness/FKs and transformations. Do not use `synchronize` or destructive reset as migration tooling.
4. Test upgrade from the preceding schema with populated records, rerun, checksum drift, failure rollback and concurrent execution on both drivers.
5. Document backup, verification and rollback limits. After an incompatible committed schema change, restore only a verified target snapshot while preserving later writes through an explicit recovery plan; there is no general automatic down-migration command.

The current one-version foundation is intentionally not a universal migration engine. Do not advertise later-version support until its history validation/upgrade tests exist. For source snapshots, giveaway JSON, secrets, data import/resume and post-cutover recovery, follow [the 1.x migration runbook](migration-1.x-to-2.0.md).
