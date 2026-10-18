import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { DatabaseClient, DatabaseDialect, PostgresDatabaseClient } from '../client/types.js';
import { MIGRATIONS_TABLE, migrateDatabase } from '../migrations/runner.js';

export interface DialectSuite {
  readonly dialect: DatabaseDialect;
  /** The database for the running test. Every test starts with empty tables. */
  readonly client: DatabaseClient;
  /** A second connection pool to the same database (Postgres only), for cross-pool races. */
  openClient(): Promise<DatabaseClient>;
}

const SCHEMA_NAME = /^ririko_test_[a-f0-9]{32}$/;

/**
 * Declares `fn` once per database dialect. SQLite runs on a fresh `:memory:` database for every
 * test. Postgres runs only when `TEST_POSTGRES_URL` is set: each suite gets its own random schema
 * (so parallel test files never share tables), built by the migration runner the bot uses, emptied
 * before every test and dropped afterwards.
 */
export function describeDialects(name: string, fn: (db: DialectSuite) => void): void {
  describe(`${name} [sqlite]`, () => {
    let current: DatabaseClient | undefined;
    beforeEach(async () => {
      current = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
      await migrateDatabase(current);
    });
    afterEach(async () => {
      await current?.close();
      current = undefined;
    });
    fn({
      dialect: 'sqlite',
      get client() {
        if (!current) throw new Error('The database is only available inside a test.');
        return current;
      },
      openClient: () => Promise.reject(new Error('SQLite :memory: has no second connection.')),
    });
  });

  const url = process.env.TEST_POSTGRES_URL;
  describe.skipIf(!url)(`${name} [postgres]`, () => {
    const schema = `ririko_test_${randomUUID().replaceAll('-', '')}`;
    const isolated = new URL(url ?? 'postgres://localhost');
    isolated.searchParams.set('options', `-c search_path=${schema}`);
    const opened: DatabaseClient[] = [];
    let admin: PostgresDatabaseClient | undefined;
    let current: DatabaseClient | undefined;
    let tables: string[] = [];
    let created = false;

    const openClient = async (): Promise<DatabaseClient> => {
      const client = await createDatabaseClient({ dialect: 'postgres', url: isolated.toString() });
      opened.push(client);
      return client;
    };

    beforeAll(async () => {
      admin = (await createDatabaseClient({
        dialect: 'postgres',
        url: url!,
      })) as PostgresDatabaseClient;
      await admin.raw.query(`CREATE SCHEMA "${schema}"`);
      created = true;
      current = await openClient();
      await migrateDatabase(current);
      const { rows } = await admin.raw.query<{ name: string }>(
        `SELECT table_name AS name FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
        [schema],
      );
      // The tracking table keeps its rows: tests start with empty tables, not an unmigrated schema.
      tables = rows.filter((row) => row.name !== MIGRATIONS_TABLE).map((row) => `"${row.name}"`);
    }, 60_000);
    beforeEach(async () => {
      // TRUNCATE of every table takes about a second; emptying only the tables in use is fast.
      const { rows } = await admin!.raw.query<{ name: string }>(
        tables
          .map((t) => `SELECT '${t}' AS name WHERE EXISTS (SELECT 1 FROM "${schema}".${t})`)
          .join(' UNION ALL '),
      );
      if (rows.length)
        await admin!.raw.query(
          `TRUNCATE ${rows.map((row) => `"${schema}".${row.name}`).join(', ')} RESTART IDENTITY CASCADE`,
        );
    });
    afterAll(async () => {
      for (const client of opened) await client.close();
      // Drop only the exact schema this suite created.
      if (created && SCHEMA_NAME.test(schema))
        await admin?.raw.query(`DROP SCHEMA "${schema}" CASCADE`);
      await admin?.close();
    });
    fn({
      dialect: 'postgres',
      get client() {
        if (!current) throw new Error('The database is only available inside a test.');
        return current;
      },
      openClient,
    });
  });
}
