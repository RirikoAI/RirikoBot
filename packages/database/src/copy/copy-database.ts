import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { is } from 'drizzle-orm';
import { DatabaseError } from '@ririko/core';
import type { PostgresDatabaseClient } from '../client/types.js';
import { ensureAdventureSchema } from '../migrations/adventure-schema.js';
import { ensureCardSerialSchema } from '../migrations/card-serials.js';
import { ensureGuildRegistrySchema } from '../migrations/guild-registry.js';
import { ensurePostgresSchema } from '../migrations/postgres-schema.js';
import { ensureTextIdColumns } from '../migrations/text-ids.js';
import * as sqliteSchema from '../schema/sqlite/index.js';

/** Options for {@link copyDatabase}. */
export interface CopyOptions {
  /** Rows per INSERT statement (default 500; capped by PostgreSQL's 65535 parameter limit). */
  batchSize?: number | undefined;
  /** Run the whole copy and the checks, then roll back instead of committing. */
  dryRun?: boolean | undefined;
}

/** Row counts for one copied table. They are equal in a report that is returned. */
export interface CopyTableReport {
  name: string;
  sourceRows: number;
  targetRows: number;
}

/** A sequence moved to the highest copied value so new rows do not collide. */
export interface CopySequenceReport {
  table: string;
  column: string;
  value: string;
}

/** What {@link copyDatabase} did. */
export interface CopyReport {
  /** Every copied table, in insert order (parents before children). */
  tables: CopyTableReport[];
  /** Target columns the source lacks (filled by NULL or their default), and other notes. */
  warnings: string[];
  /** True when the wallet plus bank balance totals were compared (and matched). */
  coinsChecked: boolean;
  /** The matching totals as decimal strings, or null when there is no economy table to check. */
  coinTotals: { wallet: string; bank: string } | null;
  sequences: CopySequenceReport[];
  /** False for a dry run, which rolls everything back. */
  committed: boolean;
}

/** The part of a PostgreSQL connection the engine uses; tests pass a fake. */
export interface PgConnection {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** One target column as `information_schema` describes it. */
export interface TargetColumn {
  table: string;
  name: string;
  dataType: string;
  nullable: boolean;
  /** Has a DEFAULT expression, is an identity column or is generated. */
  hasDefault: boolean;
  /** `GENERATED ... AS IDENTITY` kind, or null. */
  identity: 'ALWAYS' | 'BY DEFAULT' | null;
  /** A stored generated column; PostgreSQL refuses explicit values for it. */
  generated: boolean;
  /** Backed by a sequence (serial or identity). */
  sequenced: boolean;
}

/** A foreign key edge: `child` rows reference `parent` rows. */
export interface ForeignKeyEdge {
  child: string;
  parent: string;
}

/** A SQLite table found in the source: its name and column names. */
export interface SourceTable {
  name: string;
  columns: string[];
}

/** How the Drizzle SQLite schema stores a timestamp column. */
export type TimestampUnit = 'seconds' | 'milliseconds';

/** Converts one SQLite value into a value the target column accepts. */
export type ValueConverter = (value: unknown) => unknown;

/** One table ready to copy. */
export interface PlannedTable {
  name: string;
  columns: { name: string; convert: ValueConverter }[];
  /** An identity column is GENERATED ALWAYS, so the INSERT must override it. */
  overridingSystemValue: boolean;
}

export interface CopyPlan {
  /** Parents before children. */
  tables: PlannedTable[];
  warnings: string[];
}

const DEFAULT_BATCH_SIZE = 500;
/** PostgreSQL allows at most 65535 bind parameters per statement. */
const MAX_PARAMETERS = 65_535;
const BOOKKEEPING_TABLE = /^_*drizzle_/;
const INTEGER_PATTERN = /^-?\d+$/;
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function describeValue(value: unknown): string {
  if (typeof value === 'bigint') return `bigint ${value}`;
  if (value instanceof Uint8Array) return 'binary data';
  if (typeof value === 'string') return `text "${value.slice(0, 40)}"`;
  return `${typeof value} ${String(value)}`;
}

function badValue(expected: string, value: unknown): never {
  throw new TypeError(`expected ${expected}, found ${describeValue(value)}`);
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint' || typeof value === 'number') {
    if (value === 0 || value === 0n) return false;
    if (value === 1 || value === 1n) return true;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === '0' || lower === 'false') return false;
    if (lower === '1' || lower === 'true') return true;
  }
  return badValue('a boolean stored as 0 or 1', value);
}

/** Integers go to PostgreSQL as decimal text, so values above 2^53 keep every digit. */
function toIntegerText(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isInteger(value)) return String(value);
  if (typeof value === 'string' && INTEGER_PATTERN.test(value)) return value;
  return badValue('an integer', value);
}

function toDecimalText(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && DECIMAL_PATTERN.test(value)) return value;
  return badValue('a number', value);
}

function toFloat(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && DECIMAL_PATTERN.test(value)) return Number(value);
  return badValue('a number', value);
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint' || typeof value === 'number') return String(value);
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8');
  return badValue('text', value);
}

function toBytes(value: unknown): Buffer {
  if (value instanceof Uint8Array) return Buffer.from(value);
  return badValue('binary data', value);
}

function toTimestamp(value: unknown, unit: TimestampUnit): string {
  let epoch: number;
  if (typeof value === 'bigint') epoch = Number(value);
  else if (typeof value === 'number') epoch = value;
  else if (typeof value === 'string' && DECIMAL_PATTERN.test(value)) epoch = Number(value);
  else return badValue('an epoch number', value);
  const date = new Date(unit === 'seconds' ? epoch * 1000 : epoch);
  if (Number.isNaN(date.getTime())) return badValue('a valid epoch timestamp', value);
  return date.toISOString();
}

/**
 * The converter for one target column type (an `information_schema` `data_type`), or null for a
 * type the engine does not know. Timestamp columns need the unit the SQLite schema stores.
 */
export function converterFor(
  dataType: string,
  unit: TimestampUnit | undefined,
): ValueConverter | null {
  const nullable =
    (convert: ValueConverter): ValueConverter =>
    (value) =>
      value === null || value === undefined ? null : convert(value);
  switch (dataType) {
    case 'boolean':
      return nullable(toBoolean);
    case 'smallint':
    case 'integer':
    case 'bigint':
      return nullable(toIntegerText);
    case 'numeric':
      return nullable(toDecimalText);
    case 'real':
    case 'double precision':
      return nullable(toFloat);
    case 'text':
    case 'character varying':
    case 'character':
    case 'uuid':
    case 'json':
    case 'jsonb':
      // JSON columns are TEXT in SQLite; the text goes to PostgreSQL as it is.
      return nullable(toText);
    case 'bytea':
      return nullable(toBytes);
    case 'timestamp with time zone':
    case 'timestamp without time zone':
      return unit === undefined ? null : nullable((value) => toTimestamp(value, unit));
    default:
      return null;
  }
}

/**
 * How the Drizzle SQLite schema stores each timestamp column, keyed `table.column`. Columns that
 * the schema declares as plain integers are not listed: the engine refuses to guess for them.
 */
export function sqliteTimestampUnits(
  schema: Record<string, unknown> = sqliteSchema,
): Map<string, TimestampUnit> {
  const units = new Map<string, TimestampUnit>();
  for (const value of Object.values(schema)) {
    if (!is(value, SQLiteTable)) continue;
    const config = getTableConfig(value);
    for (const column of config.columns) {
      if (column.columnType !== 'SQLiteTimestamp') continue;
      const mode = (column as unknown as { mode?: string }).mode;
      units.set(`${config.name}.${column.name}`, mode === 'timestamp' ? 'seconds' : 'milliseconds');
    }
  }
  return units;
}

/**
 * Orders tables so every table comes after the tables it references. Edges to tables outside the
 * list and self references are ignored. A cycle is an error that names the tables in it.
 */
export function orderTablesByForeignKeys(tables: string[], edges: ForeignKeyEdge[]): string[] {
  const names = new Set(tables);
  const parents = new Map<string, Set<string>>(tables.map((name) => [name, new Set<string>()]));
  for (const { child, parent } of edges) {
    if (child === parent || !names.has(child) || !names.has(parent)) continue;
    parents.get(child)!.add(parent);
  }
  const ordered: string[] = [];
  const remaining = [...tables].sort();
  while (remaining.length > 0) {
    const ready = remaining.filter((name) =>
      [...parents.get(name)!].every((parent) => ordered.includes(parent)),
    );
    if (ready.length === 0) {
      throw new DatabaseError(
        `The target foreign keys form a cycle between these tables: ${remaining.join(', ')}.`,
      );
    }
    for (const name of ready) {
      ordered.push(name);
      remaining.splice(remaining.indexOf(name), 1);
    }
  }
  return ordered;
}

/**
 * Checks the source against the target and builds the per-table copy plan. Pure: it reads nothing.
 * Every problem is collected, so one failed run lists them all, and the caller has written nothing.
 */
export function buildCopyPlan(input: {
  sourceTables: SourceTable[];
  targetColumns: TargetColumn[];
  foreignKeys: ForeignKeyEdge[];
  timestampUnits: Map<string, TimestampUnit>;
}): CopyPlan {
  const problems: string[] = [];
  const warnings: string[] = [];
  const byTable = new Map<string, TargetColumn[]>();
  for (const column of input.targetColumns) {
    byTable.set(column.table, [...(byTable.get(column.table) ?? []), column]);
  }

  const planned = new Map<string, PlannedTable>();
  for (const source of input.sourceTables) {
    const targetColumns = byTable.get(source.name);
    if (!targetColumns) {
      problems.push(`Source table "${source.name}" has no table in the target.`);
      continue;
    }
    const targetByName = new Map(targetColumns.map((column) => [column.name, column]));
    const columns: PlannedTable['columns'] = [];
    for (const name of source.columns) {
      const target = targetByName.get(name);
      if (!target || target.generated) {
        problems.push(`Source column "${source.name}.${name}" has no column in the target.`);
        continue;
      }
      const convert = converterFor(
        target.dataType,
        input.timestampUnits.get(`${source.name}.${name}`),
      );
      if (!convert) {
        const timestamp = target.dataType.startsWith('timestamp');
        problems.push(
          timestamp
            ? `Column ${source.name}.${name} is a ${target.dataType} but the SQLite schema does not store it as a timestamp, so its unit is unknown.`
            : `Column ${source.name}.${name} has the unsupported type "${target.dataType}".`,
        );
        continue;
      }
      columns.push({ name, convert });
    }
    const sourceNames = new Set(source.columns);
    for (const target of targetColumns) {
      if (sourceNames.has(target.name)) continue;
      if (target.nullable || target.hasDefault) {
        warnings.push(
          `Target column ${source.name}.${target.name} is not in the source; it gets ${
            target.hasDefault ? 'its default' : 'NULL'
          }.`,
        );
      } else {
        problems.push(
          `Target column "${source.name}.${target.name}" is required (NOT NULL, no default) but the source lacks it.`,
        );
      }
    }
    planned.set(source.name, {
      name: source.name,
      columns,
      overridingSystemValue: targetColumns.some(
        (column) => column.identity === 'ALWAYS' && sourceNames.has(column.name),
      ),
    });
  }
  if (problems.length > 0) {
    throw new DatabaseError(
      `The source cannot be copied into this target. Nothing was written.\n- ${problems.join('\n- ')}`,
    );
  }

  const order = orderTablesByForeignKeys([...planned.keys()], input.foreignKeys);
  return { tables: order.map((name) => planned.get(name)!), warnings };
}

/** The INSERT for `rowCount` rows of `columns`, with numbered parameters. */
export function buildInsert(
  table: string,
  columns: string[],
  rowCount: number,
  overridingSystemValue: boolean,
): string {
  const names = columns.map(quoteIdent).join(', ');
  const rows: string[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const base = row * columns.length;
    rows.push(`(${columns.map((_, index) => `$${base + index + 1}`).join(', ')})`);
  }
  return `INSERT INTO ${quoteIdent(table)} (${names})${
    overridingSystemValue ? ' OVERRIDING SYSTEM VALUE' : ''
  } VALUES ${rows.join(', ')}`;
}

const COLUMNS_SQL = `SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default,
        c.is_identity, c.identity_generation, c.is_generated
   FROM information_schema.columns c
   JOIN information_schema.tables t
     ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = current_schema() AND t.table_type = 'BASE TABLE'
  ORDER BY c.table_name, c.ordinal_position`;

const FOREIGN_KEYS_SQL = `SELECT child.relname AS child, parent.relname AS parent
   FROM pg_constraint k
   JOIN pg_class child ON child.oid = k.conrelid
   JOIN pg_class parent ON parent.oid = k.confrelid
  WHERE k.contype = 'f'
    AND child.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())`;

async function readTargetColumns(connection: PgConnection): Promise<TargetColumn[]> {
  const { rows } = await connection.query(COLUMNS_SQL);
  return rows
    .map((row) => {
      const identity = row.is_identity === 'YES';
      const defaultText = typeof row.column_default === 'string' ? row.column_default : null;
      const generated = row.is_generated === 'ALWAYS';
      return {
        table: String(row.table_name),
        name: String(row.column_name),
        dataType: String(row.data_type),
        nullable: row.is_nullable === 'YES',
        hasDefault: defaultText !== null || identity || generated,
        identity: identity
          ? row.identity_generation === 'ALWAYS'
            ? ('ALWAYS' as const)
            : ('BY DEFAULT' as const)
          : null,
        generated,
        sequenced: identity || (defaultText?.startsWith('nextval(') ?? false),
      };
    })
    .filter((column) => !BOOKKEEPING_TABLE.test(column.table));
}

async function readForeignKeys(connection: PgConnection): Promise<ForeignKeyEdge[]> {
  const { rows } = await connection.query(FOREIGN_KEYS_SQL);
  return rows.map((row) => ({ child: String(row.child), parent: String(row.parent) }));
}

/** Reads every base table of the SQLite file (not SQLite internals or Drizzle bookkeeping). */
export function readSourceTables(source: Database.Database): SourceTable[] {
  const names = (
    source
      .prepare(
        `SELECT name FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name`,
      )
      .all() as { name: string }[]
  )
    .map((row) => row.name)
    .filter((name) => !BOOKKEEPING_TABLE.test(name));
  const columnsOf = source.prepare('SELECT name FROM pragma_table_info(?)');
  return names.map((name) => ({
    name,
    columns: (columnsOf.all(name) as { name: string }[]).map((column) => column.name),
  }));
}

function countStatement(source: Database.Database, table: string): number {
  const statement = source.prepare(`SELECT count(*) AS n FROM ${quoteIdent(table)}`);
  statement.safeIntegers(true);
  return Number((statement.get() as { n: bigint }).n);
}

async function targetCount(connection: PgConnection, table: string): Promise<number> {
  const { rows } = await connection.query(`SELECT count(*)::text AS n FROM ${quoteIdent(table)}`);
  return Number(rows[0]?.n ?? 0);
}

/**
 * Copies every table of an open SQLite database into PostgreSQL over one connection and inside
 * the transaction the caller already began: plan and refuse, insert parents before children,
 * reset sequences, then verify. It throws on any problem, and the caller rolls back.
 */
export async function copyIntoConnection(
  source: Database.Database,
  connection: PgConnection,
  options: CopyOptions = {},
  timestampUnits: Map<string, TimestampUnit> = sqliteTimestampUnits(),
): Promise<Omit<CopyReport, 'committed'>> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new DatabaseError(`The batch size must be a positive integer, got ${batchSize}.`);
  }

  const targetColumns = await readTargetColumns(connection);
  const plan = buildCopyPlan({
    sourceTables: readSourceTables(source),
    targetColumns,
    foreignKeys: await readForeignKeys(connection),
    timestampUnits,
  });

  // Refuse a target that holds anything: copying onto existing rows would mix two databases.
  const occupied: string[] = [];
  for (const table of [...new Set(targetColumns.map((column) => column.table))].sort()) {
    const { rows } = await connection.query(`SELECT 1 FROM ${quoteIdent(table)} LIMIT 1`);
    if (rows.length > 0) occupied.push(table);
  }
  if (occupied.length > 0) {
    throw new DatabaseError(
      `The target is not empty (${occupied.join(', ')}). Nothing was written. Use a fresh schema.`,
    );
  }

  const sourceCounts = new Map(
    plan.tables.map((table) => [table.name, countStatement(source, table.name)]),
  );
  let wallet = 0n;
  let bank = 0n;
  const checksBalances = plan.tables.some(
    (table) =>
      table.name === 'economy_balances' &&
      ['wallet_balance', 'bank_balance'].every((name) =>
        table.columns.some((c) => c.name === name),
      ),
  );

  for (const table of plan.tables) {
    const names = table.columns.map((column) => column.name);
    if (names.length === 0) continue;
    const perStatement = Math.max(
      1,
      Math.min(batchSize, Math.floor(MAX_PARAMETERS / names.length)),
    );
    const select = source.prepare(
      `SELECT ${names.map(quoteIdent).join(', ')} FROM ${quoteIdent(table.name)}`,
    );
    // Safe integers keep balances above 2^53 exact; they arrive as BigInt.
    select.safeIntegers(true);
    let values: unknown[] = [];
    let pending = 0;
    let rowNumber = 0;
    const flush = async (): Promise<void> => {
      if (pending === 0) return;
      try {
        await connection.query(
          buildInsert(table.name, names, pending, table.overridingSystemValue),
          values,
        );
      } catch (error) {
        throw new DatabaseError(
          `Inserting into ${table.name} failed near source row ${rowNumber}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error instanceof Error ? error : undefined },
        );
      }
      values = [];
      pending = 0;
    };
    for (const row of select.iterate() as IterableIterator<Record<string, unknown>>) {
      rowNumber += 1;
      for (const column of table.columns) {
        try {
          values.push(column.convert(row[column.name]));
        } catch (error) {
          throw new DatabaseError(
            `Cannot convert ${table.name}.${column.name} in source row ${rowNumber}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            { cause: error instanceof Error ? error : undefined },
          );
        }
      }
      if (checksBalances && table.name === 'economy_balances') {
        wallet += BigInt((row.wallet_balance as bigint | null) ?? 0n);
        bank += BigInt((row.bank_balance as bigint | null) ?? 0n);
      }
      pending += 1;
      if (pending === perStatement) await flush();
    }
    await flush();
  }

  const sequences: CopySequenceReport[] = [];
  const warnings = [...plan.warnings];
  const copied = new Set(plan.tables.map((table) => table.name));
  for (const column of targetColumns) {
    if (!column.sequenced || !copied.has(column.table)) continue;
    const { rows: max } = await connection.query(
      `SELECT max(${quoteIdent(column.name)})::text AS max FROM ${quoteIdent(column.table)}`,
    );
    const value = max[0]?.max;
    if (typeof value !== 'string') continue; // No rows: the sequence keeps its start value.
    const { rows: found } = await connection.query(
      'SELECT pg_get_serial_sequence($1, $2) AS name',
      [quoteIdent(column.table), column.name],
    );
    const name = found[0]?.name;
    if (typeof name !== 'string') {
      warnings.push(`No sequence found for ${column.table}.${column.name}; it was not reset.`);
      continue;
    }
    await connection.query('SELECT setval($1::regclass, $2::bigint, true)', [name, value]);
    sequences.push({ table: column.table, column: column.name, value });
  }

  const tables: CopyTableReport[] = [];
  const mismatched: string[] = [];
  for (const table of plan.tables) {
    const report = {
      name: table.name,
      sourceRows: sourceCounts.get(table.name) ?? 0,
      targetRows: await targetCount(connection, table.name),
    };
    tables.push(report);
    if (report.sourceRows !== report.targetRows) {
      mismatched.push(`${table.name} (source ${report.sourceRows}, target ${report.targetRows})`);
    }
  }
  if (mismatched.length > 0) {
    throw new DatabaseError(`Row counts differ after the copy: ${mismatched.join(', ')}.`);
  }

  let coinTotals: CopyReport['coinTotals'] = null;
  if (checksBalances) {
    const { rows } = await connection.query(
      `SELECT COALESCE(SUM("wallet_balance"), 0)::text AS wallet,
              COALESCE(SUM("bank_balance"), 0)::text AS bank FROM "economy_balances"`,
    );
    const target = { wallet: String(rows[0]?.wallet), bank: String(rows[0]?.bank) };
    if (target.wallet !== wallet.toString() || target.bank !== bank.toString()) {
      throw new DatabaseError(
        `Economy balances differ after the copy: source wallet ${wallet} and bank ${bank}, target wallet ${target.wallet} and bank ${target.bank}.`,
      );
    }
    coinTotals = target;
  }

  return { tables, warnings, coinsChecked: coinTotals !== null, coinTotals, sequences };
}

/**
 * Copies a 2.0 SQLite database into PostgreSQL, in one transaction. The source opens read-only
 * (a WAL file next to it is read and never changed). The target gets the schema the bot builds
 * at startup. It refuses a target that has rows, or a source that does not fit the target, and
 * it writes nothing then; any failure rolls everything back. Returns per-table row counts.
 */
export async function copyDatabase(
  sourcePath: string,
  target: PostgresDatabaseClient,
  options: CopyOptions = {},
): Promise<CopyReport> {
  if (target.dialect !== 'postgres') {
    throw new DatabaseError('The copy target must be a PostgreSQL database.');
  }
  let source: Database.Database;
  try {
    source = new (DatabaseConstructor as unknown as typeof Database)(sourcePath, {
      readonly: true,
      fileMustExist: true,
    });
  } catch (error) {
    throw new DatabaseError(`Cannot open the source SQLite database at ${sourcePath}.`, {
      cause: error instanceof Error ? error : undefined,
    });
  }
  try {
    // Prepared like the bot at startup, so the target has the exact tables the bot expects.
    await ensurePostgresSchema(target);
    await ensureTextIdColumns(target);
    await ensureAdventureSchema(target);
    await ensureCardSerialSchema(target);
    await ensureGuildRegistrySchema(target);

    const client = await target.raw.connect();
    const connection: PgConnection = {
      query: (text, values) => client.query(text, values ? [...values] : undefined),
    };
    // One read transaction pins the source snapshot, so counts match what is copied.
    source.prepare('BEGIN').run();
    try {
      await connection.query('BEGIN');
      try {
        await connection.query('SELECT pg_advisory_xact_lock(1704, 1)');
        const report = await copyIntoConnection(source, connection, options);
        if (options.dryRun) {
          await connection.query('ROLLBACK');
        } else {
          await connection.query('COMMIT');
        }
        return { ...report, committed: options.dryRun !== true };
      } catch (error) {
        await connection.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    } finally {
      client.release();
      if (source.inTransaction) source.prepare('ROLLBACK').run();
    }
  } finally {
    source.close();
  }
}
