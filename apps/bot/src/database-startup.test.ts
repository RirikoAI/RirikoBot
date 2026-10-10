import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabaseClient,
  MIGRATIONS_TABLE,
  migrationStatus,
  SQLITE_MIGRATIONS,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { MANUAL_MIGRATE_COMMAND, prepareDatabase } from './database-startup.js';

function captureLog() {
  return { log: vi.fn<(line: string) => void>(), warn: vi.fn<(line: string) => void>() };
}

describe('prepareDatabase (bot startup)', () => {
  let db: SqliteDatabaseClient;

  beforeEach(async () => {
    const client = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (client.dialect !== 'sqlite') throw new Error('Expected sqlite');
    db = client;
  });

  afterEach(async () => {
    await db.close();
  });

  const tables = () =>
    (
      db.raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]
    ).map((row) => row.name);

  describe('with DB_AUTO_MIGRATE on', () => {
    it('migrates an empty database and reports it, then reports that it is up to date', async () => {
      const first = captureLog();
      await prepareDatabase(db, { autoMigrate: true, log: first });
      expect(tables()).toContain('users');
      expect((await migrationStatus(db)).pending).toEqual([]);
      expect(first.log.mock.calls.map(([line]) => line)).toContainEqual(
        expect.stringMatching(/^• Applied migration 0000_baseline$/),
      );

      const second = captureLog();
      await prepareDatabase(db, { autoMigrate: true, log: second });
      expect(second.log).toHaveBeenCalledWith('• The database schema is up to date.');
    });

    it('adopts a database that has tables but no migration records', async () => {
      // The schema the first 2.0 builds created at startup, which is the baseline.
      for (const statement of SQLITE_MIGRATIONS[0]!.statements) db.raw.exec(statement);

      const out = captureLog();
      await prepareDatabase(db, { autoMigrate: true, log: out });

      expect(out.log.mock.calls.map(([line]) => line)).toContainEqual(
        expect.stringMatching(/^• Adopted the existing database/),
      );
      expect(await migrationStatus(db)).toMatchObject({ pending: [], adopted: true });
    });

    it('refuses a database that a newer release made a contract change to', async () => {
      await prepareDatabase(db, { autoMigrate: true, log: captureLog() });
      db.raw.exec(
        `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, contract, adopted, applied_at) VALUES ('9999_future_drop', 'x', 1, 0, 0)`,
      );
      await expect(prepareDatabase(db, { autoMigrate: true, log: captureLog() })).rejects.toThrow(
        /9999_future_drop/,
      );
    });
  });

  describe('with DB_AUTO_MIGRATE off', () => {
    it('refuses to start while migrations are pending and changes nothing', async () => {
      const error = await prepareDatabase(db, { autoMigrate: false, log: captureLog() }).then(
        () => null,
        (reason: unknown) => reason as Error,
      );
      expect(error?.message).toMatch(
        new RegExp(
          `DB_AUTO_MIGRATE is false and the database has ${SQLITE_MIGRATIONS.length} pending`,
        ),
      );
      for (const { id } of SQLITE_MIGRATIONS) expect(error?.message).toContain(id);
      expect(error?.message).toContain(MANUAL_MIGRATE_COMMAND);
      expect(tables()).toEqual([]);
    });

    it('refuses a database that has tables but no migration records yet', async () => {
      await prepareDatabase(db, { autoMigrate: true, log: captureLog() });
      db.raw.exec(`DROP TABLE ${MIGRATIONS_TABLE}`);
      await expect(prepareDatabase(db, { autoMigrate: false, log: captureLog() })).rejects.toThrow(
        /pending migration/,
      );
      expect(tables()).not.toContain(MIGRATIONS_TABLE);
    });

    it('starts on a database that is up to date', async () => {
      await prepareDatabase(db, { autoMigrate: true, log: captureLog() });
      const out = captureLog();
      await prepareDatabase(db, { autoMigrate: false, log: out });
      expect(out.log).toHaveBeenCalledWith(
        '• The database schema is up to date (DB_AUTO_MIGRATE is false).',
      );
      expect(out.warn).not.toHaveBeenCalled();
    });

    it('warns about additive migrations it does not know and starts', async () => {
      await prepareDatabase(db, { autoMigrate: true, log: captureLog() });
      db.raw.exec(
        `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, contract, adopted, applied_at) VALUES ('9999_future_add', 'x', 0, 0, 0)`,
      );
      const out = captureLog();
      await prepareDatabase(db, { autoMigrate: false, log: out });
      expect(out.warn.mock.calls[0]?.[0]).toMatch(/9999_future_add.*all additive/);
    });

    it('refuses a database with a contract migration it does not know', async () => {
      await prepareDatabase(db, { autoMigrate: true, log: captureLog() });
      db.raw.exec(
        `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, contract, adopted, applied_at) VALUES ('9999_future_drop', 'x', 1, 0, 0)`,
      );
      await expect(prepareDatabase(db, { autoMigrate: false, log: captureLog() })).rejects.toThrow(
        /contract migration\(s\) this release does not know \(9999_future_drop\)/,
      );
    });
  });
});
