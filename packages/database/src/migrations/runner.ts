import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type pg from 'pg';
import { DatabaseError } from '@ririko/core';
import type { DatabaseClient } from '../client/types.js';
import { withTransaction } from '../transactions/index.js';
import {
  adoptBaseline,
  BASELINE_ID,
  checkAdoption,
  postgresBaselineShape,
  readCurrentPostgresShape,
  readSqliteShape,
  sqliteBaselineShape,
  type AdoptionPlan,
  type AdoptionSummary,
  type AdoptionTarget,
  type SchemaShape,
} from './adopt-baseline.js';
import type { EmbeddedMigration } from './embedded.js';
import { PG_MIGRATIONS } from './generated/pg.js';
import { SQLITE_MIGRATIONS } from './generated/sqlite.js';
import { ensureTextIdColumns } from './text-ids.js';

/**
 * The versioned schema migration runner of ADR-015 decisions 3 and 8.
 *
 * Migrations are applied by `id`, in id order, each in its own transaction together with its row
 * in the tracking table `ririko_schema_migrations` (in the connection's current schema):
 *
 * - `id`: the migration id; `checksum`: sha256 of the embedded SQL file;
 * - `contract`: the migration was a contract migration (it may drop or rename);
 * - `adopted`: the row was recorded by adoption of an existing database (adopt-baseline.ts), not
 *   by running the SQL;
 * - `applied_at`: `timestamptz` on PostgreSQL, integer milliseconds on SQLite (the SQLite
 *   convention used across the schema).
 */

/** Name of the tracking table. */
export const MIGRATIONS_TABLE = 'ririko_schema_migrations';

/**
 * PostgreSQL advisory lock key held for a whole `migrateDatabase` run. The startup upgrades use
 * 1701 to 1705, so the series continues here.
 */
const ADVISORY_LOCK = [1706, 1] as const;

/** Newest SQLite pre-migration backups that are kept. */
export const SQLITE_BACKUPS_KEPT = 5;

const BACKUP_FILE = /^pre-migrate-[0-9TZ]+\.sqlite$/;

export interface MigrationLog {
  info(message: string): void;
  warn(message: string): void;
}

export interface MigrateOptions {
  /** Where progress and the downgrade warning go. Default: nowhere. */
  log?: MigrationLog | undefined;
  /** Report what would run and change nothing: no table, no backup, no migration. */
  dryRun?: boolean | undefined;
  /** The clock, for `applied_at` and the backup file name. Default: the system clock. */
  now?: (() => Date) | undefined;
  /**
   * The migrations to apply. Default: the embedded list of the client's dialect. Tests inject
   * their own list.
   */
  migrations?: readonly EmbeddedMigration[] | undefined;
}

export interface MigrateResult {
  /** The ids applied by this run (with `dryRun`: the ids that would be applied), in order. */
  applied: string[];
  /** The ids that were already recorded and known to this release. */
  alreadyApplied: string[];
  /** Recorded ids this release does not know (the database is ahead of the image). */
  unknown: string[];
  /** The SQLite backup written before the first migration, if any. */
  backupPath: string | null;
  /**
   * Set when the database had tables but no tracking table and was adopted: `0000_baseline` was
   * recorded instead of run, after an additive repair. With `dryRun`: what adoption would change.
   */
  adoption: AdoptionSummary | null;
}

export interface MigrationStatus {
  /** The newest migration id this release knows, or `null` when it has none. */
  latest: string | null;
  /** Known migrations that are not recorded yet, in order. */
  pending: string[];
  /** Recorded ids this release does not know. */
  unknown: string[];
  /** The unknown ids that were contract migrations: the downgrade guard refuses these. */
  unknownContract: string[];
  /** True when the database was adopted: a recorded row has `adopted` set. */
  adopted: boolean;
}

interface RecordedMigration {
  id: string;
  checksum: string;
  contract: boolean;
  adopted: boolean;
}

interface DatabaseState {
  tableExists: boolean;
  recorded: RecordedMigration[];
  /** Tables other than the tracking table: the schema is not empty. */
  hasApplicationTables: boolean;
}

/** What differs between the two dialects, behind one shape. */
interface Driver {
  readState(): Promise<DatabaseState>;
  ensureTable(): Promise<void>;
  /** Writes a pre-migration backup when the dialect has that; returns its path. */
  backup(at: Date): Promise<string | null>;
  /** Runs the migration and records it; false when another process recorded it first. */
  apply(migration: EmbeddedMigration, at: Date): Promise<boolean>;
  /** Adoption of an existing database (adopt-baseline.ts) on this dialect. */
  readonly adoption: AdoptionTarget;
  /** Whether the tracking table has a row for `id`; the table must exist. */
  isRecorded(id: string): Promise<boolean>;
  /** Records `migration` as adopted, without running it; the table must exist. */
  recordAdopted(migration: EmbeddedMigration, at: Date): Promise<void>;
  close(): Promise<void>;
}

/** The duplicate owned-card serial audit adoption runs, as a read. */
const CARD_SERIAL_AUDIT =
  'SELECT card_id, serial_number FROM user_cards GROUP BY card_id, serial_number HAVING count(*) > 1 LIMIT 1';

const summaryOf = (plan: AdoptionPlan): AdoptionSummary => ({
  createdTables: plan.createdTables,
  addedColumns: plan.addedColumns,
  createdIndexes: plan.createdIndexes,
  notes: plan.notes,
});

const silent: MigrationLog = { info: () => undefined, warn: () => undefined };

function defaultMigrations(client: DatabaseClient): readonly EmbeddedMigration[] {
  return client.dialect === 'postgres' ? PG_MIGRATIONS : SQLITE_MIGRATIONS;
}

/** The migrations sorted by id; a duplicate id is a programming error. */
function ordered(migrations: readonly EmbeddedMigration[]): EmbeddedMigration[] {
  const sorted = [...migrations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.id === sorted[i - 1]!.id) {
      throw new DatabaseError(`Migration id "${sorted[i]!.id}" is listed twice`);
    }
  }
  return sorted;
}

function statementsOf(migration: EmbeddedMigration): string[] {
  return migration.statements.filter((statement) => statement.trim() !== '');
}

// --- SQLite -----------------------------------------------------------------------------------

const SQLITE_TABLE_DDL = `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  id text PRIMARY KEY NOT NULL,
  checksum text NOT NULL,
  contract integer NOT NULL DEFAULT 0,
  adopted integer NOT NULL DEFAULT 0,
  applied_at integer NOT NULL
)`;

function utcStamp(at: Date): string {
  return at.toISOString().replaceAll(/[-:.]/g, '');
}

/**
 * drizzle-kit writes a SQLite table rebuild as `PRAGMA foreign_keys=OFF`, a new table, a copy,
 * `DROP TABLE`, a rename and `PRAGMA foreign_keys=ON`. SQLite ignores that pragma inside a
 * transaction, so `DROP TABLE` would delete `ON DELETE CASCADE` children (and fail on other
 * references). A migration with the first statement therefore runs as the procedure in
 * https://sqlite.org/lang_altertable.html#otheralter: see `rebuildSqlite`.
 */
const FOREIGN_KEYS_OFF = /^\s*PRAGMA\s+foreign_keys\s*=\s*(?:OFF|0|FALSE|NO)\s*;?\s*$/i;
const FOREIGN_KEYS_PRAGMA = /^\s*PRAGMA\s+foreign_keys\s*=/i;

type SqliteRaw = Extract<DatabaseClient, { dialect: 'sqlite' }>['raw'];

const foreignKeysEnabled = (raw: SqliteRaw): boolean =>
  Number(raw.pragma('foreign_keys', { simple: true })) !== 0;

/** `PRAGMA foreign_key_check` rows, as one sentence per child table. */
function foreignKeyViolations(raw: SqliteRaw): string | null {
  const rows = raw.pragma('foreign_key_check') as { table: string; parent: string }[];
  if (rows.length === 0) return null;
  const byTable = new Map<string, { count: number; parents: Set<string> }>();
  for (const row of rows) {
    const entry = byTable.get(row.table) ?? { count: 0, parents: new Set<string>() };
    entry.count += 1;
    entry.parents.add(row.parent);
    byTable.set(row.table, entry);
  }
  return [...byTable]
    .map(
      ([table, { count, parents }]) =>
        `table "${table}" has ${count} row(s) that reference a missing row in ${[...parents]
          .map((parent) => `"${parent}"`)
          .join(', ')}`,
    )
    .join('; ');
}

function openSqlite(client: Extract<DatabaseClient, { dialect: 'sqlite' }>): Driver {
  const raw = client.raw;
  let baselineShape: SchemaShape | undefined;
  return {
    async readState() {
      const tracking = raw
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(MIGRATIONS_TABLE);
      const recorded = tracking
        ? (
            raw
              .prepare(
                `SELECT id, checksum, contract, adopted FROM ${MIGRATIONS_TABLE} ORDER BY id`,
              )
              .all() as {
              id: string;
              checksum: string;
              contract: number;
              adopted: number;
            }[]
          ).map((row) => ({
            id: row.id,
            checksum: row.checksum,
            contract: row.contract !== 0,
            adopted: row.adopted !== 0,
          }))
        : [];
      const { count } = raw
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> ?",
        )
        .get(MIGRATIONS_TABLE) as { count: number };
      return { tableExists: Boolean(tracking), recorded, hasApplicationTables: count > 0 };
    },
    async ensureTable() {
      raw.exec(SQLITE_TABLE_DDL);
    },
    async backup(at) {
      // In-memory databases have no file to copy.
      if (raw.name === '' || raw.name === ':memory:' || !raw.open) return null;
      const directory = join(dirname(raw.name), 'backups');
      mkdirSync(directory, { recursive: true });
      const path = join(directory, `pre-migrate-${utcStamp(at)}.sqlite`);
      // VACUUM INTO cannot run inside a transaction; the runner has not started one yet.
      raw.exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
      const backups = readdirSync(directory)
        .filter((name) => BACKUP_FILE.test(name))
        .sort();
      for (const name of backups.slice(0, Math.max(0, backups.length - SQLITE_BACKUPS_KEPT))) {
        unlinkSync(join(directory, name));
      }
      return path;
    },
    async apply(migration, at) {
      const statements = statementsOf(migration);
      // A table rebuild: foreign keys are off for the whole transaction (see FOREIGN_KEYS_OFF).
      const rebuild = statements.some((statement) => FOREIGN_KEYS_OFF.test(statement));
      const foreignKeysWere = rebuild ? foreignKeysEnabled(raw) : false;
      // The pragma only takes effect outside a transaction, so it comes before BEGIN.
      if (rebuild) raw.pragma('foreign_keys = OFF');
      let applied = true;
      try {
        // withTransaction opens BEGIN IMMEDIATE behind the connection's mutex.
        await withTransaction(client, async () => {
          // Another process may have recorded it between our read and this write lock.
          if (raw.prepare(`SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE id = ?`).get(migration.id)) {
            applied = false;
            return;
          }
          // Another task's transaction on this connection can have made the pragma a no-op.
          if (rebuild && foreignKeysEnabled(raw)) {
            throw new DatabaseError(
              'Foreign keys could not be turned off for the table rebuild: another transaction was open on the connection.',
            );
          }
          for (const statement of statements) {
            if (rebuild && FOREIGN_KEYS_PRAGMA.test(statement)) continue;
            raw.exec(statement);
          }
          // The rebuild must not leave a reference to a missing row; nothing else checks it
          // while foreign keys are off.
          const violations = rebuild ? foreignKeyViolations(raw) : null;
          if (violations) {
            throw new DatabaseError(`The rebuild left dangling foreign keys: ${violations}`);
          }
          raw
            .prepare(
              `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, contract, adopted, applied_at) VALUES (?, ?, ?, 0, ?)`,
            )
            .run(migration.id, migration.checksum, migration.contract ? 1 : 0, at.getTime());
        });
      } finally {
        // Outside the transaction again (committed or rolled back): restore the setting.
        if (rebuild) raw.pragma(`foreign_keys = ${foreignKeysWere ? 'ON' : 'OFF'}`);
      }
      return applied;
    },
    adoption: {
      dialect: 'sqlite',
      // The baseline is the same for the whole run: read it once for the check and the adoption.
      baselineShape: async (statements) => (baselineShape ??= sqliteBaselineShape(statements)),
      liveShape: async () => readSqliteShape(raw),
      hasDuplicateCardSerials: async () => raw.prepare(CARD_SERIAL_AUDIT).get() !== undefined,
      // SQLite ids were always text.
      repairTextIds: async () => undefined,
      transaction: (fn) =>
        withTransaction(client, () =>
          fn(async (statement) => {
            raw.exec(statement);
          }),
        ),
    },
    async isRecorded(id) {
      return raw.prepare(`SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE id = ?`).get(id) !== undefined;
    },
    async recordAdopted(migration, at) {
      raw
        .prepare(
          `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, contract, adopted, applied_at) VALUES (?, ?, ?, 1, ?)`,
        )
        .run(migration.id, migration.checksum, migration.contract ? 1 : 0, at.getTime());
    },
    async close() {
      // The connection belongs to the caller.
    },
  };
}

// --- PostgreSQL -------------------------------------------------------------------------------

const PG_TABLE_DDL = `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  id text PRIMARY KEY NOT NULL,
  checksum text NOT NULL,
  contract boolean NOT NULL DEFAULT false,
  adopted boolean NOT NULL DEFAULT false,
  applied_at timestamp with time zone NOT NULL
)`;

async function openPostgres(
  client: Extract<DatabaseClient, { dialect: 'postgres' }>,
  lock: boolean,
): Promise<Driver> {
  // One dedicated connection: a session advisory lock belongs to the connection that took it.
  const connection: pg.PoolClient = await client.raw.connect();
  let locked = false;
  let baselineShape: SchemaShape | undefined;
  try {
    if (lock) {
      await connection.query('SELECT pg_advisory_lock($1, $2)', [...ADVISORY_LOCK]);
      locked = true;
    }
  } catch (error) {
    connection.release(true);
    throw error;
  }
  return {
    async readState() {
      const schema = await connection.query<{ name: string }>(
        `SELECT table_name AS name FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`,
      );
      const tableExists = schema.rows.some((row) => row.name === MIGRATIONS_TABLE);
      const recorded = tableExists
        ? (
            await connection.query<RecordedMigration>(
              `SELECT id, checksum, contract, adopted FROM ${MIGRATIONS_TABLE} ORDER BY id`,
            )
          ).rows
        : [];
      return {
        tableExists,
        recorded,
        hasApplicationTables: schema.rows.some((row) => row.name !== MIGRATIONS_TABLE),
      };
    },
    async ensureTable() {
      await connection.query(PG_TABLE_DDL);
    },
    async backup() {
      return null;
    },
    async apply(migration, at) {
      await connection.query('BEGIN');
      try {
        // Statements run as simple queries, as ensurePostgresSchema does.
        for (const statement of statementsOf(migration)) await connection.query(statement);
        await connection.query(
          `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, contract, adopted, applied_at) VALUES ($1, $2, $3, false, $4)`,
          [migration.id, migration.checksum, migration.contract, at],
        );
        await connection.query('COMMIT');
        return true;
      } catch (error) {
        await connection.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    },
    adoption: {
      dialect: 'postgres',
      // The baseline is the same for the whole run: read it once for the check and the adoption.
      baselineShape: async (statements) =>
        (baselineShape ??= await postgresBaselineShape(connection, statements)),
      liveShape: () => readCurrentPostgresShape(connection),
      hasDuplicateCardSerials: async () =>
        (await connection.query(CARD_SERIAL_AUDIT)).rows.length > 0,
      // Its own connection and transaction; it takes no table lock this connection holds.
      repairTextIds: async () => {
        await ensureTextIdColumns(client);
      },
      transaction: async (fn) => {
        await connection.query('BEGIN');
        try {
          const result = await fn(async (statement) => {
            await connection.query(statement);
          });
          await connection.query('COMMIT');
          return result;
        } catch (error) {
          await connection.query('ROLLBACK').catch(() => undefined);
          throw error;
        }
      },
    },
    async isRecorded(id) {
      const { rows } = await connection.query(`SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE id = $1`, [
        id,
      ]);
      return rows.length > 0;
    },
    async recordAdopted(migration, at) {
      await connection.query(
        `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, contract, adopted, applied_at) VALUES ($1, $2, $3, true, $4)`,
        [migration.id, migration.checksum, migration.contract, at],
      );
    },
    async close() {
      let broken = false;
      if (locked) {
        try {
          await connection.query('SELECT pg_advisory_unlock($1, $2)', [...ADVISORY_LOCK]);
        } catch {
          // A connection that cannot unlock is destroyed, which ends the session and the lock.
          broken = true;
        }
      }
      connection.release(broken);
    },
  };
}

function openDriver(client: DatabaseClient, lock: boolean): Promise<Driver> {
  return client.dialect === 'postgres'
    ? openPostgres(client, lock)
    : Promise.resolve(openSqlite(client));
}

// --- Planning ---------------------------------------------------------------------------------

function plan(migrations: readonly EmbeddedMigration[], recorded: readonly RecordedMigration[]) {
  const known = new Map(migrations.map((migration) => [migration.id, migration]));
  const byId = new Map(recorded.map((row) => [row.id, row]));
  return {
    alreadyApplied: migrations.filter((m) => byId.has(m.id)).map((m) => m.id),
    pending: migrations.filter((m) => !byId.has(m.id)),
    mismatched: migrations.filter((m) => byId.has(m.id) && byId.get(m.id)!.checksum !== m.checksum),
    unknown: recorded.filter((row) => !known.has(row.id)),
  };
}

/**
 * Applies the pending migrations, in id order. Every migration runs in its own transaction with
 * its tracking row, so a failure rolls back only that migration and stops the run. Checks run
 * before any change: a recorded migration whose checksum differs from the embedded one, and the
 * downgrade guard (below), stop the run with a `DatabaseError`.
 *
 * - PostgreSQL: one dedicated connection holds `pg_advisory_lock` for the whole run, so two
 *   processes migrate one after the other and each migration is applied once.
 * - SQLite: each migration runs in `BEGIN IMMEDIATE`. A migration that contains `PRAGMA
 *   foreign_keys=OFF` (drizzle-kit's table rebuild) runs as SQLite's rebuild procedure: the pragma
 *   is applied on the connection before BEGIN, the two `PRAGMA foreign_keys` statements are
 *   skipped inside the transaction, `PRAGMA foreign_key_check` must find no row before COMMIT
 *   (otherwise the migration rolls back with the table named), and the setting is restored
 *   afterwards. A file database with application tables
 *   and pending migrations is first copied with `VACUUM INTO <db dir>/backups/pre-migrate-<UTC
 *   stamp>.sqlite`; the newest 5 such files are kept.
 * - Downgrade guard: recorded ids this release does not know are returned in `unknown`. If any of
 *   them was a contract migration, the run throws; otherwise it logs one warning and continues.
 * - A database that has application tables but no tracking table is adopted once
 *   (adopt-baseline.ts): under the same lock, and after the same SQLite backup,
 *   `ensureTextIdColumns` and the card serial audit run, the live schema is reconciled with
 *   `0000_baseline` additively, and the baseline is recorded as applied (`adopted`) instead of
 *   being run. Later migrations then run as usual. A problem the reconciliation cannot repair
 *   refuses the adoption with a report and no change. A dry run reports the same plan.
 */
export async function migrateDatabase(
  client: DatabaseClient,
  options: MigrateOptions = {},
): Promise<MigrateResult> {
  const log = options.log ?? silent;
  const now = options.now ?? (() => new Date());
  const dryRun = options.dryRun === true;
  const migrations = ordered(options.migrations ?? defaultMigrations(client));

  const driver = await openDriver(client, !dryRun);
  try {
    const state = await driver.readState();
    const adopting = !state.tableExists && state.hasApplicationTables;
    const baseline = migrations.find((migration) => migration.id === BASELINE_ID);
    if (adopting && !baseline) {
      throw new DatabaseError(
        `The database has tables but no ${MIGRATIONS_TABLE} table, and this release has no ${BASELINE_ID} migration to adopt it with.`,
      );
    }

    const planned = plan(migrations, state.recorded);
    const { alreadyApplied, mismatched, unknown } = planned;
    // An adopted baseline is recorded, not run.
    const pending = adopting
      ? planned.pending.filter((migration) => migration.id !== BASELINE_ID)
      : planned.pending;
    if (mismatched.length > 0) {
      throw new DatabaseError(
        `Migration ${mismatched.map((m) => m.id).join(', ')} was changed after it was applied: ` +
          'its checksum differs from the recorded one. Restore the migration file, or restore the database.',
        { details: { migrations: mismatched.map((m) => m.id) } },
      );
    }
    const unknownIds = unknown.map((row) => row.id);
    const unknownContract = unknown.filter((row) => row.contract).map((row) => row.id);
    if (unknownContract.length > 0) {
      throw new DatabaseError(
        `The database has contract migration(s) this release does not know (${unknownContract.join(', ')}). ` +
          'Deploy the newer release, or restore the pre-deploy dump, before starting this release.',
        { details: { migrations: unknownContract } },
      );
    }
    if (unknownIds.length > 0) {
      log.warn(
        `The database has ${unknownIds.length} migration(s) this release does not know (${unknownIds.join(', ')}); ` +
          'they are all additive, so this release continues.',
      );
    }

    const result: MigrateResult = {
      applied: [],
      alreadyApplied,
      unknown: unknownIds,
      backupPath: null,
      adoption: null,
    };
    // Reads only: throws with a report of every problem before anything is backed up or changed.
    const checked = adopting
      ? await checkAdoption(driver.adoption, baseline!, [MIGRATIONS_TABLE])
      : null;
    if (dryRun) {
      result.applied = pending.map((m) => m.id);
      if (checked) result.adoption = summaryOf(checked);
      return result;
    }
    if (!adopting && pending.length === 0) return result;

    if (state.hasApplicationTables) {
      result.backupPath = await driver.backup(now());
      if (result.backupPath) log.info(`Wrote the pre-migration backup ${result.backupPath}`);
    }
    if (adopting) {
      let adoption: AdoptionSummary | null;
      try {
        adoption = await adoptBaseline(driver.adoption, baseline!, {
          ignoreTables: [MIGRATIONS_TABLE],
          ensureTable: () => driver.ensureTable(),
          isRecorded: () => driver.isRecorded(BASELINE_ID),
          record: () => driver.recordAdopted(baseline!, now()),
        });
      } catch (error) {
        if (error instanceof DatabaseError) throw error;
        throw new DatabaseError(
          `Adopting the existing database failed and was rolled back: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error instanceof Error ? error : undefined },
        );
      }
      if (adoption) {
        result.adoption = adoption;
        for (const note of adoption.notes) log.warn(note);
        log.info(
          `Adopted the existing database: recorded ${BASELINE_ID} without running it (created ${adoption.createdTables.length} table(s), added ${adoption.addedColumns.length} column(s), created ${adoption.createdIndexes.length} index(es))`,
        );
      } else {
        // Another process adopted it between our read and our write lock.
        result.alreadyApplied.push(BASELINE_ID);
      }
    }
    await driver.ensureTable();
    for (const migration of pending) {
      let applied: boolean;
      try {
        applied = await driver.apply(migration, now());
      } catch (error) {
        throw new DatabaseError(
          `Migration ${migration.id} failed and was rolled back: ${
            error instanceof Error ? error.message : String(error)
          }`,
          {
            cause: error instanceof Error ? error : undefined,
            details: { migration: migration.id },
          },
        );
      }
      if (applied) {
        result.applied.push(migration.id);
        log.info(`Applied migration ${migration.id}`);
      } else {
        result.alreadyApplied.push(migration.id);
      }
    }
    return result;
  } finally {
    await driver.close();
  }
}

/**
 * What `migrateDatabase` would find, without changing anything and without the lock: for the CLI
 * (`db:migrate --status`) and the dashboard's readiness check. A database without a tracking
 * table reports every migration as pending.
 */
export async function migrationStatus(
  client: DatabaseClient,
  options: Pick<MigrateOptions, 'migrations'> = {},
): Promise<MigrationStatus> {
  const migrations = ordered(options.migrations ?? defaultMigrations(client));
  const driver = await openDriver(client, false);
  try {
    const { recorded } = await driver.readState();
    const { pending, unknown } = plan(migrations, recorded);
    return {
      latest: migrations.at(-1)?.id ?? null,
      pending: pending.map((m) => m.id),
      unknown: unknown.map((row) => row.id),
      unknownContract: unknown.filter((row) => row.contract).map((row) => row.id),
      adopted: recorded.some((row) => row.adopted),
    };
  } finally {
    await driver.close();
  }
}
