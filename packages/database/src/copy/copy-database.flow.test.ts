import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostgresDatabaseClient, SqliteDatabaseClient } from '../client/types.js';
import { migrateDatabase } from '../migrations/runner.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';
import { BIG_BANK, BIG_WALLET, MOMENT, buildSource } from '../testing/copy-fixture.js';
import { FakePostgres, fakePostgresTarget } from '../testing/fake-postgres.js';
import { copyDatabase } from './copy-database.js';

// Migrating the target needs a real PostgreSQL server; the integration suite covers it. Here the
// transaction handling of `copyDatabase` runs against a scripted connection. The SQLite sources
// of the fixtures still migrate for real.
vi.mock('../migrations/runner.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../migrations/runner.js')>();
  return {
    ...original,
    migrateDatabase: vi.fn(async (...args: Parameters<typeof original.migrateDatabase>) =>
      args[0].dialect === 'postgres'
        ? { applied: [], alreadyApplied: [], unknown: [], backupPath: null, adoption: null }
        : original.migrateDatabase(...args),
    ),
  };
});

const directory = mkdtempSync(join(tmpdir(), 'ririko-copy-flow-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const open = (path: string): Database.Database =>
  new (DatabaseConstructor as unknown as typeof Database)(path);

function writeSource(name: string, journal: 'DELETE' | 'WAL' = 'DELETE'): Database.Database {
  const db = open(join(directory, name));
  db.pragma(`journal_mode = ${journal}`);
  db.exec(SQLITE_SCHEMA_DDL);
  db.prepare('INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    'u1',
    'alice',
    1_700_000_000_000,
    1_700_000_000_000,
  );
  db.prepare(
    'INSERT INTO economy_balances (user_id, wallet_balance, bank_balance, updated_at) VALUES (?, ?, ?, ?)',
  ).run('u1', 50, 25, 1_700_000_000_000);
  return db;
}

describe('copyDatabase', () => {
  beforeEach(() => {
    vi.mocked(migrateDatabase).mockClear();
  });

  it('prepares the target like the bot, copies in one transaction and commits', async () => {
    writeSource('commit.sqlite').close();
    const fake = new FakePostgres();
    const { client, released } = fakePostgresTarget(fake);

    const report = await copyDatabase(join(directory, 'commit.sqlite'), client);

    expect(report.committed).toBe(true);
    expect(report.coinTotals).toEqual({ wallet: '50', bank: '25' });
    expect(report.tables.find((table) => table.name === 'users')).toEqual({
      name: 'users',
      sourceRows: 1,
      targetRows: 1,
    });
    expect(migrateDatabase).toHaveBeenCalledWith(client);
    expect(fake.statements[0]).toBe('BEGIN');
    expect(fake.statements.at(-1)).toBe('COMMIT');
    expect(fake.statements).not.toContain('ROLLBACK');
    expect(released()).toBe(1);
  });

  it('runs everything and then rolls back on a dry run', async () => {
    writeSource('dry.sqlite').close();
    const fake = new FakePostgres();
    const { client, released } = fakePostgresTarget(fake);

    const report = await copyDatabase(join(directory, 'dry.sqlite'), client, { dryRun: true });

    expect(report.committed).toBe(false);
    expect(report.tables.every((table) => table.sourceRows === table.targetRows)).toBe(true);
    expect(fake.statements.at(-1)).toBe('ROLLBACK');
    expect(fake.statements).not.toContain('COMMIT');
    expect(released()).toBe(1);
  });

  it('rolls back and releases the connection when the copy fails', async () => {
    writeSource('fail.sqlite').close();
    const fake = new FakePostgres({ failInsertInto: 'users' });
    const { client, released } = fakePostgresTarget(fake);

    await expect(copyDatabase(join(directory, 'fail.sqlite'), client)).rejects.toThrow(
      /Inserting into users failed/,
    );

    expect(fake.statements.at(-1)).toBe('ROLLBACK');
    expect(fake.statements).not.toContain('COMMIT');
    expect(released()).toBe(1);
  });

  it('rolls back when the target is not empty', async () => {
    writeSource('occupied.sqlite').close();
    const fake = new FakePostgres({ occupied: ['users'] });
    const { client } = fakePostgresTarget(fake);

    await expect(copyDatabase(join(directory, 'occupied.sqlite'), client)).rejects.toThrow(
      /The target is not empty \(users\)/,
    );

    expect(fake.inserts).toEqual([]);
    expect(fake.statements.at(-1)).toBe('ROLLBACK');
  });

  it('copies a database built through the real repositories without a conversion error', async () => {
    const { path, source, cardId } = await buildSource(directory, 'repositories');
    await source.close();
    const fake = new FakePostgres();
    const { client } = fakePostgresTarget(fake);

    const report = await copyDatabase(path, client);

    const rows = Object.fromEntries(report.tables.map((table) => [table.name, table.targetRows]));
    expect(rows).toMatchObject({
      users: 2,
      economy_balances: 3,
      economy_transactions: 1,
      user_cards: 2,
      waifu_cards: 1,
      waifu_card_serials: 1,
      adventure_sessions: 1,
      adventure_choices: 1,
      guild_settings: 1,
    });
    expect(report.coinTotals).toEqual({
      wallet: (BIG_WALLET + 1800n).toString(),
      bank: (BIG_BANK + 250n).toString(),
    });
    const order = report.tables.map((table) => table.name);
    expect(order.indexOf('adventure_sessions')).toBeLessThan(order.indexOf('adventure_choices'));
    expect(fake.objectsOf('users')[0]).toMatchObject({
      id: 'u1',
      is_blacklisted: false,
      created_at: MOMENT.toISOString(),
    });
    expect(fake.objectsOf('economy_balances').find((row) => row.user_id === 'u3')).toMatchObject({
      wallet_balance: BIG_WALLET.toString(),
      bank_balance: BIG_BANK.toString(),
    });
    expect(fake.objectsOf('economy_transactions')[0]?.metadata).toBe(
      '{"reason":"seed","nested":{"list":[1,2,3]}}',
    );
    expect(fake.objectsOf('waifu_card_serials')).toEqual([{ card_id: cardId, next_serial: '3' }]);
    expect(fake.objectsOf('adventure_settings')).toEqual([
      { guild_id: 'g1', energy_enabled: false },
    ]);
    expect(fake.objectsOf('guild_settings')[0]).toMatchObject({
      no_xp_channel_ids: '["c1","c2"]',
      escalation_steps: '[{"warnThreshold":3,"action":"TIMEOUT","durationSeconds":600}]',
      voice_xp_enabled: true,
    });
  });

  it('reads rows that are only in the WAL file and leaves the source file untouched', async () => {
    // The writer stays open, so its rows live in the -wal file and are never checkpointed here.
    const writer = writeSource('wal.sqlite', 'WAL');
    const path = join(directory, 'wal.sqlite');
    const before = statSync(path);
    const fake = new FakePostgres();
    const { client } = fakePostgresTarget(fake);

    const report = await copyDatabase(path, client);

    const after = statSync(path);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(report.tables.find((table) => table.name === 'users')?.targetRows).toBe(1);
    expect(fake.objectsOf('users')[0]).toMatchObject({ id: 'u1', username: 'alice' });
    writer.close();
  });

  it('refuses a source that is missing, without touching the target', async () => {
    const fake = new FakePostgres();
    const { client } = fakePostgresTarget(fake);

    await expect(copyDatabase(join(directory, 'missing.sqlite'), client)).rejects.toThrow(
      /Cannot open the source SQLite database/,
    );

    expect(migrateDatabase).not.toHaveBeenCalled();
    expect(fake.statements).toEqual([]);
  });

  it('refuses a target that is not PostgreSQL', async () => {
    const sqliteTarget = { dialect: 'sqlite' } as unknown as SqliteDatabaseClient;

    await expect(
      copyDatabase(
        join(directory, 'commit.sqlite'),
        sqliteTarget as unknown as PostgresDatabaseClient,
      ),
    ).rejects.toThrow('The copy target must be a PostgreSQL database.');
  });
});
