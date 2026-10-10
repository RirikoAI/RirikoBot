import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import type pg from 'pg';
import { DatabaseError } from '@ririko/core';
import type { EmbeddedMigration } from './embedded.js';
import { TEXT_ID_COLUMNS } from './text-ids.js';

/** Why adoption refuses a database whose owned cards share a serial number. */
export const DUPLICATE_SERIALS_MESSAGE =
  'Duplicate owned-card serials require an explicit repair before enabling adventure. No cards were changed.';

/**
 * One-time adoption of an existing database (ADR-015 decision 5).
 *
 * A database that has tables but no tracking table (staging, self-hosted 2.0 databases) was built
 * by the old startup path: the full DDL plus the `ensure*` upgrades, and for some columns only a
 * "needs `db:push`" note. Running `0000_baseline` on it would fail on the first existing table, so
 * the live schema is reconciled with the baseline instead, additively, and `0000_baseline` is
 * recorded as applied.
 *
 * The expected shape is read from a scratch database that really runs the baseline statements (an
 * in-memory SQLite database; temporary tables inside a rolled-back PostgreSQL transaction), and the
 * live shape is read with the same queries, so no SQL is parsed to learn types or defaults.
 * Reconciliation:
 *
 * - a missing table is created from its baseline statement, with its indexes and foreign keys;
 * - a missing index is created from its baseline statement;
 * - a missing column that is nullable or has a default is added with the type and default the
 *   scratch database reports;
 * - an extra table or column is only reported;
 * - a missing NOT NULL column without a default, a column that cannot be added, a type that
 *   differs, or duplicate owned-card serials refuse the adoption with a report of every problem.
 *   Nothing is changed in that case.
 */

/** The migration that holds the schema at adoption time. */
export const BASELINE_ID = '0000_baseline';

export interface ColumnShape {
  /** PostgreSQL `format_type` text; the declared type upper-cased on SQLite. */
  readonly type: string;
  readonly notNull: boolean;
  /** The default expression as the database reports it, or null. */
  readonly default: string | null;
  readonly primaryKey: boolean;
  /** An identity or generated column. */
  readonly generated: boolean;
}

export interface SchemaShape {
  /** Table name to its columns, in column order. */
  readonly tables: Map<string, Map<string, ColumnShape>>;
  /** Index name to the table it belongs to (explicit indexes only on SQLite). */
  readonly indexes: Map<string, string>;
}

export interface AdoptionPlan {
  /** What reconciliation executes, in baseline order. */
  readonly statements: string[];
  /** Reasons the adoption must be refused; empty when it may go on. */
  readonly problems: string[];
  /** Drift that is only reported: extra tables and columns, differing nullability or defaults. */
  readonly notes: string[];
  readonly createdTables: string[];
  readonly addedColumns: string[];
  readonly createdIndexes: string[];
}

/** What an adoption changed, for logs and the CLI. */
export type AdoptionSummary = Pick<
  AdoptionPlan,
  'createdTables' | 'addedColumns' | 'createdIndexes' | 'notes'
>;

/** What differs between the dialects for adoption, behind one shape. */
export interface AdoptionTarget {
  readonly dialect: 'sqlite' | 'postgres';
  /** The baseline's shape, read from a scratch database that is thrown away. */
  baselineShape(statements: readonly string[]): Promise<SchemaShape>;
  /** The live database's shape (the current schema on PostgreSQL). */
  liveShape(): Promise<SchemaShape>;
  /** Whether `user_cards` holds two rows with one (card_id, serial_number). */
  hasDuplicateCardSerials(): Promise<boolean>;
  /** `ensureTextIdColumns`: PostgreSQL uuid id columns become text. A no-op on SQLite. */
  repairTextIds(): Promise<void>;
  /** Runs `fn` in one transaction; `run` executes one statement inside it. */
  transaction<T>(fn: (run: (statement: string) => Promise<void>) => Promise<T>): Promise<T>;
}

/** The tracking-table operations of the runner, which `adoptBaseline` calls inside its transaction. */
export interface AdoptionTracking {
  /** Tables the comparison ignores: the tracking table. */
  readonly ignoreTables: readonly string[];
  ensureTable(): Promise<void>;
  isRecorded(): Promise<boolean>;
  record(): Promise<void>;
}

// --- Baseline statements ----------------------------------------------------------------------

type BaselineEntry =
  | { kind: 'table'; name: string; statement: string }
  | { kind: 'index'; name: string; table: string; statement: string }
  | { kind: 'constraint'; table: string; statement: string };

const IDENT = '[`"]?(\\w+)[`"]?';
const CREATE_TABLE = new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENT}`, 'i');
const CREATE_INDEX = new RegExp(
  `^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENT}\\s+ON\\s+${IDENT}`,
  'i',
);
const ADD_CONSTRAINT = new RegExp(`^ALTER\\s+TABLE\\s+${IDENT}\\s+ADD\\s+CONSTRAINT`, 'i');

/** The baseline is drizzle-kit output: tables, indexes and foreign keys. Anything else is a bug. */
function parseBaseline(statements: readonly string[]): BaselineEntry[] {
  const entries: BaselineEntry[] = [];
  for (const raw of statements) {
    const statement = raw.trim();
    if (statement === '') continue;
    const table = CREATE_TABLE.exec(statement);
    if (table) {
      entries.push({ kind: 'table', name: table[1]!, statement });
      continue;
    }
    const index = CREATE_INDEX.exec(statement);
    if (index) {
      entries.push({ kind: 'index', name: index[1]!, table: index[2]!, statement });
      continue;
    }
    const constraint = ADD_CONSTRAINT.exec(statement);
    if (constraint) {
      entries.push({ kind: 'constraint', table: constraint[1]!, statement });
      continue;
    }
    throw new DatabaseError(
      `The baseline holds a statement adoption does not understand: ${statement.slice(0, 80)}`,
    );
  }
  return entries;
}

// --- Planning ---------------------------------------------------------------------------------

const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

/** A default SQLite accepts in `ALTER TABLE ... ADD COLUMN`: a constant, not an expression. */
const SQLITE_CONSTANT_DEFAULT =
  /^(?:[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|'(?:[^']|'')*'|true|false|null|x'[0-9a-fA-F]*')$/i;

function addColumnStatement(table: string, name: string, column: ColumnShape): string {
  const type = column.type === '' ? '' : ` ${column.type}`;
  const fallback = column.default === null ? '' : ` DEFAULT ${column.default}`;
  return `ALTER TABLE ${quote(table)} ADD COLUMN ${quote(name)}${type}${fallback}${
    column.notNull ? ' NOT NULL' : ''
  }`;
}

/** Why a missing column cannot be added, or null when it can. */
function cannotAdd(
  dialect: AdoptionTarget['dialect'],
  table: string,
  name: string,
  column: ColumnShape,
): string | null {
  const at = `"${table}.${name}"`;
  if (column.generated) return `${at} is missing and is a generated or identity column`;
  if (column.primaryKey) return `${at} is missing and is part of the primary key`;
  if (column.notNull && column.default === null) {
    return `${at} is missing and is NOT NULL without a default, so existing rows would have no value`;
  }
  if (
    dialect === 'sqlite' &&
    column.default !== null &&
    !SQLITE_CONSTANT_DEFAULT.test(column.default)
  ) {
    return `${at} is missing and its default ${column.default} is not a constant, which SQLite cannot add to an existing table`;
  }
  return null;
}

/**
 * Compares the live shape with the baseline's and lists what to run and what to refuse. Pure: no
 * database access. `ignoreTables` (the tracking table) is neither compared nor reported.
 */
export function planAdoption(input: {
  dialect: AdoptionTarget['dialect'];
  statements: readonly string[];
  expected: SchemaShape;
  live: SchemaShape;
  ignoreTables?: readonly string[];
}): AdoptionPlan {
  const { dialect, expected, live } = input;
  const ignored = new Set(input.ignoreTables ?? []);
  const plan: AdoptionPlan = {
    statements: [],
    problems: [],
    notes: [],
    createdTables: [],
    addedColumns: [],
    createdIndexes: [],
  };
  const created = new Set<string>();

  for (const entry of parseBaseline(input.statements)) {
    if (entry.kind === 'table') {
      const wanted = expected.tables.get(entry.name);
      const present = live.tables.get(entry.name);
      if (!present) {
        plan.statements.push(entry.statement);
        plan.createdTables.push(entry.name);
        created.add(entry.name);
        continue;
      }
      for (const [name, column] of wanted ?? []) {
        const found = present.get(name);
        if (!found) {
          const reason = cannotAdd(dialect, entry.name, name, column);
          if (reason) plan.problems.push(reason);
          else {
            plan.statements.push(addColumnStatement(entry.name, name, column));
            plan.addedColumns.push(`${entry.name}.${name}`);
          }
          continue;
        }
        if (found.type !== column.type) {
          plan.problems.push(
            `"${entry.name}.${name}" is ${found.type || '(no type)'} but the baseline has ${column.type || '(no type)'}`,
          );
        } else if (found.notNull !== column.notNull) {
          plan.notes.push(
            `"${entry.name}.${name}" is ${found.notNull ? 'NOT NULL' : 'nullable'} but the baseline has it ${column.notNull ? 'NOT NULL' : 'nullable'}; left as it is`,
          );
        }
      }
      for (const name of present.keys()) {
        if (!wanted?.has(name)) {
          plan.notes.push(`Extra column "${entry.name}.${name}" is not in the baseline; kept`);
        }
      }
    } else if (entry.kind === 'index') {
      if (!live.indexes.has(entry.name)) {
        plan.statements.push(entry.statement);
        plan.createdIndexes.push(entry.name);
      }
    } else if (created.has(entry.table)) {
      plan.statements.push(entry.statement);
    }
  }

  for (const table of live.tables.keys()) {
    if (!expected.tables.has(table) && !ignored.has(table)) {
      plan.notes.push(`Extra table "${table}" is not in the baseline; kept`);
    }
  }
  return plan;
}

/** `ensureTextIdColumns` turns these uuid columns into text; compare as if it already had. */
function assumeTextIds(live: SchemaShape): SchemaShape {
  const tables = new Map<string, Map<string, ColumnShape>>();
  for (const [table, columns] of live.tables) tables.set(table, new Map(columns));
  for (const { table, column } of TEXT_ID_COLUMNS) {
    const found = tables.get(table)?.get(column);
    if (found?.type === 'uuid') tables.get(table)!.set(column, { ...found, type: 'text' });
  }
  return { tables, indexes: live.indexes };
}

function refusal(problems: readonly string[]): DatabaseError {
  return new DatabaseError(
    `The existing database cannot be adopted. Nothing was changed.\n- ${problems.join('\n- ')}`,
    { details: { problems: [...problems] } },
  );
}

function withoutIgnored(shape: SchemaShape, ignore: readonly string[]): SchemaShape {
  const tables = new Map(shape.tables);
  for (const name of ignore) tables.delete(name);
  return { tables, indexes: shape.indexes };
}

/**
 * Reads everything and changes nothing: the plan adoption would run, or a `DatabaseError` listing
 * every problem. The caller backs up (SQLite) only after this passes. PostgreSQL uuid id columns
 * count as the text columns `repairTextIds` makes of them.
 */
export async function checkAdoption(
  target: AdoptionTarget,
  baseline: EmbeddedMigration,
  ignoreTables: readonly string[],
): Promise<AdoptionPlan> {
  const statements = baseline.statements.filter((statement) => statement.trim() !== '');
  const expected = await target.baselineShape(statements);
  const live = await target.liveShape();
  const checked = planAdoption({
    dialect: target.dialect,
    statements,
    expected,
    live: assumeTextIds(withoutIgnored(live, ignoreTables)),
    ignoreTables,
  });
  const serials = live.tables.get('user_cards');
  const problems = [...checked.problems];
  if (serials?.has('card_id') && serials.has('serial_number')) {
    if (await target.hasDuplicateCardSerials()) problems.push(DUPLICATE_SERIALS_MESSAGE);
  }
  if (problems.length > 0) throw refusal(problems);
  return checked;
}

/**
 * Adopts the database: repairs uuid id columns, then in one transaction creates the tracking
 * table, reconciles the schema with the baseline and records the baseline as adopted. Returns
 * what changed, or null when another process recorded the baseline first. Call `checkAdoption`
 * (and take the SQLite backup) before this.
 */
export async function adoptBaseline(
  target: AdoptionTarget,
  baseline: EmbeddedMigration,
  tracking: AdoptionTracking,
): Promise<AdoptionSummary | null> {
  await target.repairTextIds();
  const statements = baseline.statements.filter((statement) => statement.trim() !== '');
  const expected = await target.baselineShape(statements);
  return target.transaction(async (run) => {
    await tracking.ensureTable();
    if (await tracking.isRecorded()) return null;
    const live = withoutIgnored(await target.liveShape(), tracking.ignoreTables);
    const reconcile = planAdoption({
      dialect: target.dialect,
      statements,
      expected,
      live,
      ignoreTables: tracking.ignoreTables,
    });
    if (reconcile.problems.length > 0) throw refusal(reconcile.problems);
    for (const statement of reconcile.statements) await run(statement);
    await tracking.record();
    return {
      createdTables: reconcile.createdTables,
      addedColumns: reconcile.addedColumns,
      createdIndexes: reconcile.createdIndexes,
      notes: reconcile.notes,
    };
  });
}

// --- Reading shapes: SQLite -------------------------------------------------------------------

/** The tables, columns and explicit indexes of a SQLite database. */
export function readSqliteShape(raw: Database.Database): SchemaShape {
  const tables = new Map<string, Map<string, ColumnShape>>();
  const names = (
    raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((row) => row.name);
  for (const table of names) {
    const columns = new Map<string, ColumnShape>();
    const info = raw.prepare(`PRAGMA table_xinfo(${quote(table)})`).all() as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
      hidden: number;
    }[];
    for (const column of info) {
      // hidden 1 is a virtual-table column; 2 and 3 are generated columns.
      if (column.hidden === 1) continue;
      columns.set(column.name, {
        type: column.type.trim().toUpperCase(),
        notNull: column.notnull !== 0,
        default: column.dflt_value,
        primaryKey: column.pk > 0,
        generated: column.hidden === 2 || column.hidden === 3,
      });
    }
    tables.set(table, columns);
  }
  const indexes = new Map<string, string>();
  for (const row of raw
    .prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL")
    .all() as { name: string; tbl_name: string }[]) {
    indexes.set(row.name, row.tbl_name);
  }
  return { tables, indexes };
}

/** The baseline's shape: its statements run in a throwaway in-memory database. */
export function sqliteBaselineShape(statements: readonly string[]): SchemaShape {
  const scratch = new (DatabaseConstructor as unknown as typeof Database)(':memory:');
  try {
    for (const statement of statements) scratch.exec(statement);
    return readSqliteShape(scratch);
  } finally {
    scratch.close();
  }
}

// --- Reading shapes: PostgreSQL ---------------------------------------------------------------

const PG_COLUMNS_SQL = `SELECT c.relname AS table_name, a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS type,
       a.attnotnull AS not_null,
       pg_get_expr(d.adbin, d.adrelid) AS default_expr,
       a.attidentity IN ('a', 'd') AS generated,
       EXISTS (SELECT 1 FROM pg_index i
                WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY (i.indkey)) AS primary_key
  FROM pg_class c
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
 WHERE c.relkind IN ('r', 'p')
   AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
 ORDER BY c.relname, a.attnum`;

const PG_INDEXES_SQL = 'SELECT indexname, tablename FROM pg_indexes WHERE schemaname = $1';

/** The tables, columns and indexes of one PostgreSQL schema. */
export async function readPostgresShape(
  connection: pg.PoolClient,
  schema: string,
): Promise<SchemaShape> {
  const tables = new Map<string, Map<string, ColumnShape>>();
  const columns = await connection.query<{
    table_name: string;
    column_name: string;
    type: string;
    not_null: boolean;
    default_expr: string | null;
    generated: boolean;
    primary_key: boolean;
  }>(PG_COLUMNS_SQL, [schema]);
  for (const row of columns.rows) {
    const table = tables.get(row.table_name) ?? new Map<string, ColumnShape>();
    tables.set(row.table_name, table);
    table.set(row.column_name, {
      type: row.type,
      notNull: row.not_null,
      default: row.default_expr,
      primaryKey: row.primary_key,
      generated: row.generated,
    });
  }
  const indexes = new Map<string, string>();
  const found = await connection.query<{ indexname: string; tablename: string }>(PG_INDEXES_SQL, [
    schema,
  ]);
  for (const row of found.rows) indexes.set(row.indexname, row.tablename);
  return { tables, indexes };
}

/** The shape of the connection's current schema. */
export async function readCurrentPostgresShape(connection: pg.PoolClient): Promise<SchemaShape> {
  const { rows } = await connection.query<{ name: string | null }>(
    'SELECT current_schema() AS name',
  );
  return readPostgresShape(connection, rows[0]?.name ?? '');
}

/**
 * The baseline's shape: its statements run as temporary tables (the search path is `pg_temp`, so
 * no schema privilege is needed and no name can clash) inside a transaction that is rolled back.
 */
export async function postgresBaselineShape(
  connection: pg.PoolClient,
  statements: readonly string[],
): Promise<SchemaShape> {
  await connection.query('BEGIN');
  try {
    await connection.query('SET LOCAL search_path TO pg_temp');
    for (const statement of statements) await connection.query(statement);
    const { rows } = await connection.query<{ name: string }>(
      'SELECT nspname AS name FROM pg_namespace WHERE oid = pg_my_temp_schema()',
    );
    return await readPostgresShape(connection, rows[0]!.name);
  } finally {
    await connection.query('ROLLBACK').catch(() => undefined);
  }
}
