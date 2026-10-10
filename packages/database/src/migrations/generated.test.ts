import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { createDatabaseClient } from '../client/factory.js';
import type { PostgresDatabaseClient } from '../client/types.js';
import { PG_SCHEMA_DDL } from '../schema/pg/ddl.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';
import { PG_MIGRATIONS } from './generated/pg.js';
import { SQLITE_MIGRATIONS } from './generated/sqlite.js';

const BREAKPOINT = '--> statement-breakpoint';

const dialects = [
  { name: 'sqlite', migrations: SQLITE_MIGRATIONS, ddl: SQLITE_SCHEMA_DDL },
  { name: 'pg', migrations: PG_MIGRATIONS, ddl: PG_SCHEMA_DDL },
] as const;

function readSqlFiles(dialect: string): Map<string, string> {
  const dir = new URL(`../../migrations/${dialect}/`, import.meta.url);
  const files = new Map<string, string>();
  for (const name of readdirSync(fileURLToPath(dir)).filter((file) => file.endsWith('.sql'))) {
    files.set(name.replace(/\.sql$/, ''), readFileSync(new URL(name, dir), 'utf8'));
  }
  return files;
}

function splitStatements(sql: string): string[] {
  return sql
    .split(BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

/** Statements of SQL text, whether drizzle separated them by breakpoints or by line breaks. */
function statementsOf(sql: string): string[] {
  return sql
    .replaceAll(BREAKPOINT, '')
    .split(/;\s*\n/)
    .map((statement) => statement.trim().replace(/;$/, ''))
    .filter(Boolean);
}

describe.each(dialects)('embedded $name migrations', ({ name, migrations, ddl }) => {
  // When one of these fails, run: pnpm db:generate
  const files = readSqlFiles(name);

  it('lists the migration files in order, each embedded byte for byte', () => {
    expect(migrations.map((m) => m.id)).toEqual([...files.keys()].sort());
    for (const migration of migrations) {
      const text = files.get(migration.id)!.replaceAll('\r\n', '\n');
      expect(migration.checksum).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
      expect(migration.statements).toEqual(splitStatements(text));
      expect(migration.contract).toBe(text.startsWith('-- ririko:contract'));
    }
  });

  it('numbers the migrations from 0000, starting with the baseline', () => {
    migrations.forEach((migration, index) => {
      expect(migration.id).toMatch(new RegExp(`^${String(index).padStart(4, '0')}_[a-z0-9_]+$`));
    });
    expect(migrations[0]?.id).toBe('0000_baseline');
  });

  it('splits only on drizzle breakpoints and never leaves a marker or empty statement', () => {
    for (const migration of migrations) {
      expect(migration.statements.length).toBeGreaterThan(0);
      for (const statement of migration.statements) {
        expect(statement).not.toContain(BREAKPOINT);
        expect(statement.trim()).not.toBe('');
      }
    }
  });

  it('makes the baseline equal to the generated full DDL, statement for statement', () => {
    const baseline = migrations[0]!;
    expect(statementsOf(baseline.statements.join('\n')).sort()).toEqual(statementsOf(ddl).sort());
    expect(baseline.contract).toBe(false);
  });
});

describe('PostgreSQL migrations', () => {
  it('use unqualified names, so they build the connection search_path', () => {
    for (const migration of PG_MIGRATIONS) {
      expect(migration.statements.join('\n')).not.toContain('"public".');
    }
  });
});

describe('the SQLite baseline against SQLITE_SCHEMA_DDL', () => {
  function describeSchema(db: Database.Database): Record<string, unknown> {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const schema: Record<string, unknown> = {};
    for (const { name } of tables) {
      schema[name] = {
        columns: db.prepare(`PRAGMA table_info(\`${name}\`)`).all(),
        indexes: db
          .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ?`)
          .all(name),
        foreignKeys: db.prepare(`PRAGMA foreign_key_list(\`${name}\`)`).all(),
      };
    }
    return schema;
  }

  function apply(statements: readonly string[]): Record<string, unknown> {
    const db = new Database(':memory:');
    for (const statement of statements) db.exec(statement);
    const schema = describeSchema(db);
    db.close();
    return schema;
  }

  it('creates the same tables, columns, defaults and indexes', () => {
    const fromMigrations = apply(SQLITE_MIGRATIONS.flatMap((m) => m.statements));
    const fromDdl = apply([SQLITE_SCHEMA_DDL]);
    expect(Object.keys(fromMigrations).length).toBeGreaterThan(90);
    expect(fromMigrations).toEqual(fromDdl);
  });
});

const postgresUrl = process.env.TEST_POSTGRES_URL ?? process.env.ADVENTURE_TEST_POSTGRES_URL;

// Explicit opt-in only. Everything happens in two newly generated schemas, dropped afterwards.
describe.skipIf(!postgresUrl)('the PostgreSQL baseline against PG_SCHEMA_DDL', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const schemas = { migrations: `mig_test_${suffix}`, ddl: `ddl_test_${suffix}` };
  let admin: PostgresDatabaseClient;
  const clients: PostgresDatabaseClient[] = [];
  let created = false;

  async function connect(schema: string): Promise<PostgresDatabaseClient> {
    const isolated = new URL(postgresUrl!);
    isolated.searchParams.set('options', `-c search_path=${schema}`);
    const client = (await createDatabaseClient({
      dialect: 'postgres',
      url: isolated.toString(),
    })) as PostgresDatabaseClient;
    clients.push(client);
    return client;
  }

  async function describeSchema(schema: string) {
    const columns = await admin.raw.query(
      `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
              character_maximum_length, numeric_precision
         FROM information_schema.columns WHERE table_schema = $1
        ORDER BY table_name, column_name`,
      [schema],
    );
    // The admin session's search_path differs from the schema under test, so PostgreSQL prints
    // the schema in definitions (quoted or not); drop it to compare the two schemas.
    const strip = (expression: string) =>
      `regexp_replace(${expression}, '"?${schema}"?\\.', '', 'g')`;
    const indexes = await admin.raw.query(
      `SELECT tablename, indexname, ${strip('indexdef')} AS def
         FROM pg_indexes WHERE schemaname = $1 ORDER BY tablename, indexname`,
      [schema],
    );
    const constraints = await admin.raw.query(
      `SELECT ${strip('conrelid::regclass::text')} AS tbl, conname, contype,
              ${strip('pg_get_constraintdef(oid)')} AS def
         FROM pg_constraint WHERE connamespace = $1::regnamespace
        ORDER BY 1, conname`,
      [schema],
    );
    return { columns: columns.rows, indexes: indexes.rows, constraints: constraints.rows };
  }

  async function run(schema: string, statements: readonly string[]): Promise<void> {
    const client = await connect(schema);
    const connection = await client.raw.connect();
    try {
      await connection.query('BEGIN');
      for (const statement of statements) await connection.query(statement);
      await connection.query('COMMIT');
    } finally {
      connection.release();
    }
  }

  beforeAll(async () => {
    admin = (await createDatabaseClient({
      dialect: 'postgres',
      url: postgresUrl!,
    })) as PostgresDatabaseClient;
    await admin.raw.query(`CREATE SCHEMA "${schemas.migrations}"`);
    await admin.raw.query(`CREATE SCHEMA "${schemas.ddl}"`);
    created = true;
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()));
    if (created) {
      for (const schema of Object.values(schemas)) {
        if (/^(mig|ddl)_test_[a-f0-9]{32}$/.test(schema)) {
          await admin.raw.query(`DROP SCHEMA "${schema}" CASCADE`);
        }
      }
    }
    await admin?.close();
  });

  it('creates the same tables, columns, defaults, indexes and constraints', async () => {
    await run(
      schemas.migrations,
      PG_MIGRATIONS.flatMap((m) => m.statements),
    );
    await run(schemas.ddl, [PG_SCHEMA_DDL]);

    const fromMigrations = await describeSchema(schemas.migrations);
    const fromDdl = await describeSchema(schemas.ddl);
    expect(fromMigrations.columns.length).toBeGreaterThan(500);
    expect(fromMigrations).toEqual(fromDdl);
  }, 60_000);
});
