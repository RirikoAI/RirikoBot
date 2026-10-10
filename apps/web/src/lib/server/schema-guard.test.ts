import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabaseClient,
  MIGRATIONS_TABLE,
  migrateDatabase,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { assertSchemaCurrent, SchemaNotReadyError } from './schema-guard';

describe('assertSchemaCurrent', () => {
  let db: SqliteDatabaseClient;

  beforeEach(async () => {
    const client = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (client.dialect !== 'sqlite') throw new Error('Expected sqlite');
    db = client;
  });

  afterEach(async () => {
    await db.close();
  });

  it('accepts a migrated database', async () => {
    await migrateDatabase(db);
    const log = { warn: vi.fn() };
    await expect(assertSchemaCurrent(db, log)).resolves.toBeUndefined();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('names the pending migrations of a database that was never migrated, and changes nothing', async () => {
    const error = await assertSchemaCurrent(db).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(SchemaNotReadyError);
    expect((error as SchemaNotReadyError).message).toMatch(
      /1 pending migration\(s\) \(0000_baseline\)/,
    );
    expect((error as SchemaNotReadyError).message).toContain('ririko db:migrate');
    expect((error as SchemaNotReadyError).pending).toEqual(['0000_baseline']);
    expect(
      db.raw.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get(),
    ).toEqual({ n: 0 });
  });

  it('counts a database with tables but no migration records as behind', async () => {
    await migrateDatabase(db);
    db.raw.exec(`DROP TABLE ${MIGRATIONS_TABLE}`);
    await expect(assertSchemaCurrent(db)).rejects.toThrow(/0000_baseline/);
  });

  it('warns about additive migrations it does not know and carries on', async () => {
    await migrateDatabase(db);
    db.raw.exec(
      `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, contract, adopted, applied_at) VALUES ('9999_future_add', 'x', 0, 0, 0)`,
    );
    const log = { warn: vi.fn() };
    await expect(assertSchemaCurrent(db, log)).resolves.toBeUndefined();
    expect(log.warn.mock.calls[0]?.[0]).toMatch(/9999_future_add.*all additive/);
  });

  it('refuses a database a newer release made a contract change to', async () => {
    await migrateDatabase(db);
    db.raw.exec(
      `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, contract, adopted, applied_at) VALUES ('9999_future_drop', 'x', 1, 0, 0)`,
    );
    await expect(assertSchemaCurrent(db)).rejects.toThrow(
      /contract migration\(s\) this dashboard release does not know \(9999_future_drop\)/,
    );
  });
});
