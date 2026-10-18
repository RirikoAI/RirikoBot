import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { createLegacyDatabase } from './__fixtures__/legacy-database.js';
import { upgradeLegacyDatabase } from './upgrade.js';

function openRaw(path: string): Database.Database {
  return new (DatabaseConstructor as unknown as typeof Database)(path);
}

function fingerprint(path: string): { sha256: string; mtimeMs: number } {
  return {
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    mtimeMs: statSync(path).mtimeMs,
  };
}

describe('upgradeLegacyDatabase', () => {
  let dir: string;
  let sourcePath: string;
  let target: SqliteDatabaseClient;

  const count = (table: string) =>
    (target.raw.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number }).c;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-upgrade-test-'));
    sourcePath = join(dir, 'ririko.db');
    createLegacyDatabase(sourcePath);
    // A new 2.0 install: the real schema, no rows.
    const client = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (client.dialect !== 'sqlite') throw new Error('Expected sqlite');
    target = client;
  });

  afterEach(async () => {
    await target.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing when there is no legacy database', async () => {
    const result = await upgradeLegacyDatabase(target, { sourcePath: join(dir, 'missing.db') });
    expect(result).toEqual({ status: 'no-source' });
    expect(count('users')).toBe(0);
  });

  it('migrates once, records the run, and skips the same database afterwards', async () => {
    const before = fingerprint(sourcePath);

    const first = await upgradeLegacyDatabase(target, { sourcePath });
    expect(first.status).toBe('migrated');
    if (first.status !== 'migrated') return;
    expect(first.sourceSha256).toBe(before.sha256);
    expect(first.migration.totalCoinsMigrated).toBe(1800n);
    expect(count('users')).toBe(3);
    expect(count('guilds')).toBe(2);

    const record = target.raw
      .prepare('SELECT * FROM legacy_migrations WHERE source_sha256 = ?')
      .get(before.sha256) as Record<string, unknown>;
    expect(record).toMatchObject({
      batch_id: first.migration.batchId,
      legacy_coins: '1800',
      migrated_coins: '1800',
    });
    expect(JSON.parse(String(record['counts']))).toMatchObject({ users: 3, guilds: 2 });

    const second = await upgradeLegacyDatabase(target, { sourcePath });
    expect(second).toMatchObject({
      status: 'already-migrated',
      sourceSha256: before.sha256,
      batchId: first.migration.batchId,
    });
    expect(count('users')).toBe(3);
    expect(count('legacy_migrations')).toBe(1);

    // The source is read as bytes only: not one byte or timestamp changes.
    expect(fingerprint(sourcePath)).toEqual(before);
  });

  it('previews without writing on a dry run', async () => {
    const result = await upgradeLegacyDatabase(target, { sourcePath, dryRun: true });
    expect(result.status).toBe('dry-run');
    if (result.status !== 'dry-run') return;
    expect(result.migration.migratedCounts['users']).toBe(3);
    expect(count('users')).toBe(0);
    expect(count('legacy_migrations')).toBe(0);
  });

  it('leaves a target with users alone unless forced', async () => {
    target.raw
      .prepare('INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, 0, 0)')
      .run('user_new', 'New in 2.0');

    const skipped = await upgradeLegacyDatabase(target, { sourcePath });
    expect(skipped).toMatchObject({
      status: 'target-not-empty',
      reason: 'it already has 1 user',
    });
    expect(count('users')).toBe(1);
    expect(count('legacy_migrations')).toBe(0);

    const forced = await upgradeLegacyDatabase(target, { sourcePath, force: true });
    expect(forced.status).toBe('migrated');
    expect(count('users')).toBe(4);
  });

  it('does not migrate a second, different 1.4.0 database automatically', async () => {
    await upgradeLegacyDatabase(target, { sourcePath });

    const otherPath = join(dir, 'other.db');
    createLegacyDatabase(otherPath);
    const other = openRaw(otherPath);
    other.prepare(`UPDATE "user" SET coins = coins + 1 WHERE id = 'user_alice'`).run();
    other.close();

    const result = await upgradeLegacyDatabase(target, { sourcePath: otherPath });
    expect(result).toMatchObject({
      status: 'target-not-empty',
      reason: 'a different 1.4.0 database was already migrated into it',
    });
    expect(count('legacy_migrations')).toBe(1);
  });

  it('refuses to write anything when the coin totals would not match', async () => {
    // Negative balances are clamped to 0 by the transformer, so the totals differ.
    const db = openRaw(sourcePath);
    db.prepare(`UPDATE "user" SET coins = -50 WHERE id = 'user_charlie'`).run();
    db.close();

    await expect(upgradeLegacyDatabase(target, { sourcePath })).rejects.toThrow(
      /Legacy coin totals do not match \(legacy 1750, migrated 1800\); nothing was written/,
    );
    expect(count('users')).toBe(0);
    expect(count('legacy_migrations')).toBe(0);
  });

  it('includes committed pages still in the write-ahead log, without touching the source', async () => {
    // A 1.4.0 process stopped before checkpointing: the newest user is only in the -wal file.
    const writer = openRaw(sourcePath);
    writer.pragma('journal_mode = WAL');
    writer.pragma('wal_autocheckpoint = 0');
    writer
      .prepare(
        `INSERT INTO "user" (id, username, displayName, coins) VALUES ('user_dana', 'Dana', 'Dana', 200)`,
      )
      .run();
    try {
      expect(existsSync(`${sourcePath}-wal`)).toBe(true);
      const walBefore = fingerprint(`${sourcePath}-wal`);

      const result = await upgradeLegacyDatabase(target, { sourcePath });
      expect(result.status).toBe('migrated');
      if (result.status !== 'migrated') return;
      expect(result.migration.totalCoinsMigrated).toBe(2000n);
      expect(count('users')).toBe(4);
      expect(fingerprint(`${sourcePath}-wal`).sha256).toBe(walBefore.sha256);
    } finally {
      writer.close();
    }
  });
});
