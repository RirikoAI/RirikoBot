import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../client/factory.js';
import type { PostgresDatabaseClient } from '../client/types.js';
import { ensurePostgresSchema } from './postgres-schema.js';

describe('ensurePostgresSchema', () => {
  it('leaves SQLite to createSqliteClient', async () => {
    const client = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    expect(await ensurePostgresSchema(client)).toBe(false);
    await client.close();
  });
});

const url = process.env.TEST_POSTGRES_URL ?? process.env.ADVENTURE_TEST_POSTGRES_URL;

// Explicit opt-in only. Everything happens in a newly generated schema that is dropped afterwards.
describe.skipIf(!url)('ensurePostgresSchema on PostgreSQL', () => {
  const schema = `bootstrap_test_${randomUUID().replaceAll('-', '')}`;
  let admin: PostgresDatabaseClient;
  const clients: PostgresDatabaseClient[] = [];
  let created = false;

  async function connect(): Promise<PostgresDatabaseClient> {
    const isolated = new URL(url!);
    isolated.searchParams.set('options', `-c search_path=${schema}`);
    const client = (await createDatabaseClient({
      dialect: 'postgres',
      url: isolated.toString(),
    })) as PostgresDatabaseClient;
    clients.push(client);
    return client;
  }

  beforeAll(async () => {
    admin = (await createDatabaseClient({
      dialect: 'postgres',
      url: url!,
    })) as PostgresDatabaseClient;
    await admin.raw.query(`CREATE SCHEMA "${schema}"`);
    created = true;
  });

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()));
    if (created && /^bootstrap_test_[a-f0-9]{32}$/.test(schema)) {
      await admin.raw.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await admin?.close();
  });

  it('builds an empty schema once when the bot and the dashboard start together', async () => {
    const [bot, web] = await Promise.all([connect(), connect()]);
    const results = await Promise.all([ensurePostgresSchema(bot), ensurePostgresSchema(web)]);
    expect(results.sort()).toEqual([false, true]);

    const { rows } = await admin.raw.query<{ count: string }>(
      `SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = $1`,
      [schema],
    );
    expect(Number(rows[0]!.count)).toBeGreaterThan(90);
    expect(await ensurePostgresSchema(web)).toBe(false);
    // The bootstrap's advisory lock is database-wide, so this waits for every other Postgres
    // suite in the run (describeDialects) that is building its own schema at the same time.
  }, 60_000);
});
