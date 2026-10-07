import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import type { PostgresDatabaseClient } from '../client/types.js';
import type { ForeignKeyEdge, PgConnection } from '../copy/copy-database.js';
import * as pgSchema from '../schema/pg/index.js';

export interface FakeColumnSpec {
  name: string;
  dataType: string;
  nullable?: boolean;
  hasDefault?: boolean;
  identity?: 'ALWAYS' | 'BY DEFAULT';
  /** Backed by a sequence (serial). Identity columns are always sequenced. */
  sequenced?: boolean;
}

export interface FakeTableSpec {
  name: string;
  columns: FakeColumnSpec[];
}

export interface FakePostgresOptions {
  /** Tables to add to the ones the Drizzle PostgreSQL schema declares. */
  extraTables?: FakeTableSpec[];
  /** Tables that already hold a row. */
  occupied?: string[];
  /** An INSERT into this table throws. */
  failInsertInto?: string;
  /** Hide the last row of this table after it was written, so the counts differ. */
  loseRowIn?: string;
  /** Make the target economy sums differ from what was written. */
  skewBalances?: boolean;
  /** `pg_get_serial_sequence` finds nothing. */
  noSequence?: boolean;
  /** Foreign keys; the default is what the Drizzle PostgreSQL schema declares. */
  foreignKeys?: ForeignKeyEdge[];
}

/** The `information_schema` data_type for a Drizzle `getSQLType()` string. */
function dataTypeOf(sqlType: string): string {
  if (sqlType.startsWith('varchar')) return 'character varying';
  if (sqlType.startsWith('char(')) return 'character';
  if (sqlType.startsWith('timestamp')) {
    return sqlType.includes('without') ? 'timestamp without time zone' : 'timestamp with time zone';
  }
  return sqlType.replace(/\(.*\)$/, '');
}

function schemaTables(): { tables: FakeTableSpec[]; foreignKeys: ForeignKeyEdge[] } {
  const tables: FakeTableSpec[] = [];
  const foreignKeys: ForeignKeyEdge[] = [];
  for (const value of Object.values(pgSchema)) {
    if (!is(value, PgTable)) continue;
    const config = getTableConfig(value);
    tables.push({
      name: config.name,
      columns: config.columns.map((column) => ({
        name: column.name,
        dataType: dataTypeOf(column.getSQLType()),
        nullable: !column.notNull,
        hasDefault: column.hasDefault,
      })),
    });
    for (const foreignKey of config.foreignKeys) {
      foreignKeys.push({
        child: config.name,
        parent: getTableConfig(foreignKey.reference().foreignTable).name,
      });
    }
  }
  return { tables, foreignKeys };
}

/** One INSERT the fake received. */
export interface FakeInsert {
  table: string;
  columns: string[];
  rows: unknown[][];
  overridingSystemValue: boolean;
}

/**
 * A scripted stand-in for a PostgreSQL connection, enough for the SQLite to PostgreSQL copy
 * engine: it answers the metadata queries from the Drizzle PostgreSQL schema, keeps inserted
 * rows in memory, and records every statement. No database server is involved.
 */
export class FakePostgres implements PgConnection {
  readonly statements: string[] = [];
  readonly inserts: FakeInsert[] = [];
  readonly sequenceResets: { name: string; value: string }[] = [];
  readonly stored = new Map<string, unknown[][]>();
  private readonly tables: FakeTableSpec[];
  private readonly foreignKeys: ForeignKeyEdge[];

  constructor(private readonly options: FakePostgresOptions = {}) {
    const fromSchema = schemaTables();
    this.tables = [...fromSchema.tables, ...(options.extraTables ?? [])];
    this.foreignKeys = options.foreignKeys ?? fromSchema.foreignKeys;
    for (const table of this.tables) this.stored.set(table.name, []);
    for (const name of options.occupied ?? []) this.stored.set(name, [[]]);
  }

  columnNames(table: string): string[] {
    return this.tables.find((candidate) => candidate.name === table)!.columns.map((c) => c.name);
  }

  rowsOf(table: string): unknown[][] {
    return this.stored.get(table) ?? [];
  }

  /** Rows of `table` as objects keyed by column name. */
  objectsOf(table: string, columns: string[] = this.columnNames(table)): Record<string, unknown>[] {
    return this.rowsOf(table).map((row) =>
      Object.fromEntries(columns.map((column, index) => [column, row[index]])),
    );
  }

  async query(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: Record<string, unknown>[] }> {
    this.statements.push(text);
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text) || text.includes('pg_advisory_xact_lock')) {
      return { rows: [] };
    }
    if (text.includes('information_schema.columns')) return { rows: this.columnRows() };
    if (text.includes('pg_constraint')) {
      return { rows: this.foreignKeys.map(({ child, parent }) => ({ child, parent })) };
    }
    const exists = /^SELECT 1 FROM "(.+)" LIMIT 1$/.exec(text);
    if (exists) return { rows: this.rowsOf(exists[1]!).length > 0 ? [{ '?column?': 1 }] : [] };
    if (text.startsWith('INSERT INTO ')) return this.insert(text, values);
    const count = /^SELECT count\(\*\)::text AS n FROM "(.+)"$/.exec(text);
    if (count) {
      const hidden = this.options.loseRowIn === count[1] ? 1 : 0;
      return { rows: [{ n: String(Math.max(0, this.rowsOf(count[1]!).length - hidden)) }] };
    }
    const max = /^SELECT max\("(.+)"\)::text AS max FROM "(.+)"$/.exec(text);
    if (max) return { rows: [{ max: this.maxOf(max[2]!, max[1]!) }] };
    if (text.startsWith('SELECT pg_get_serial_sequence')) {
      return { rows: [{ name: this.options.noSequence ? null : `seq_${String(values[1])}` }] };
    }
    if (text.startsWith('SELECT setval')) {
      this.sequenceResets.push({ name: String(values[0]), value: String(values[1]) });
      return { rows: [] };
    }
    if (text.includes('SUM("wallet_balance")')) return { rows: [this.balanceTotals()] };
    throw new Error(`FakePostgres does not understand: ${text}`);
  }

  private columnRows(): Record<string, unknown>[] {
    return this.tables.flatMap((table) =>
      table.columns.map((column) => ({
        table_name: table.name,
        column_name: column.name,
        data_type: column.dataType,
        is_nullable: column.nullable === false ? 'NO' : 'YES',
        column_default: column.sequenced
          ? `nextval('${table.name}_${column.name}_seq'::regclass)`
          : null,
        is_identity: column.identity ? 'YES' : 'NO',
        identity_generation: column.identity ?? null,
        is_generated: 'NEVER',
        // hasDefault is derived by the engine from these; mirror the Drizzle default flag.
        ...(column.hasDefault && !column.sequenced && !column.identity
          ? { column_default: 'DEFAULT_EXPRESSION' }
          : {}),
      })),
    );
  }

  private insert(text: string, values: readonly unknown[]): { rows: Record<string, unknown>[] } {
    const match = /^INSERT INTO "(.+?)" \((.+?)\)( OVERRIDING SYSTEM VALUE)? VALUES /.exec(text);
    if (!match) throw new Error(`FakePostgres cannot parse: ${text}`);
    const table = match[1]!;
    if (this.options.failInsertInto === table) {
      throw new Error(`insert into "${table}" violates a constraint`);
    }
    const columns = match[2]!.split(', ').map((name) => name.slice(1, -1));
    const rows: unknown[][] = [];
    for (let offset = 0; offset < values.length; offset += columns.length) {
      rows.push(values.slice(offset, offset + columns.length));
    }
    this.inserts.push({ table, columns, rows, overridingSystemValue: Boolean(match[3]) });
    // Keep stored rows in the table's own column order.
    const all = this.columnNames(table);
    for (const row of rows) {
      this.rowsOf(table).push(all.map((name) => row[columns.indexOf(name)] ?? null));
    }
    return { rows: [] };
  }

  private maxOf(table: string, column: string): string | null {
    const index = this.columnNames(table).indexOf(column);
    const numbers = this.rowsOf(table)
      .map((row) => row[index])
      .filter((value): value is string => value !== null && value !== undefined)
      .map((value) => BigInt(String(value)));
    return numbers.length === 0 ? null : numbers.reduce((a, b) => (a > b ? a : b)).toString();
  }

  private balanceTotals(): Record<string, unknown> {
    const sum = (column: string): bigint => {
      const index = this.columnNames('economy_balances').indexOf(column);
      return this.rowsOf('economy_balances').reduce(
        (total, row) => total + BigInt(String(row[index] ?? 0)),
        0n,
      );
    };
    const skew = this.options.skewBalances ? 1n : 0n;
    return {
      wallet: (sum('wallet_balance') + skew).toString(),
      bank: sum('bank_balance').toString(),
    };
  }
}

/** A `PostgresDatabaseClient` whose pool hands out the fake, for `copyDatabase`. */
export function fakePostgresTarget(fake: FakePostgres): {
  client: PostgresDatabaseClient;
  released: () => number;
} {
  let released = 0;
  const pool = {
    connect: async () => ({
      query: (text: string, values?: unknown[]) => fake.query(text, values),
      release: () => {
        released += 1;
      },
    }),
  };
  const client = {
    dialect: 'postgres' as const,
    raw: pool,
    db: {},
    close: async () => undefined,
    ping: async () => ({ ok: true, dialect: 'postgres' as const, latencyMs: 0 }),
  } as unknown as PostgresDatabaseClient;
  return { client, released: () => released };
}
