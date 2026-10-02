import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseClient, type DatabaseClient } from '@ririko/database';
import { describeUpgrade, main, parseArgs, runLegacyUpgrade } from './legacy-upgrade.js';

/** The real 1.4.0 schema (TASK-1261), read from the database package's fixtures. */
const LEGACY_SCHEMA = readFileSync(
  new URL(
    '../../../packages/database/src/migration/__fixtures__/legacy-1.4.0-schema.sql',
    import.meta.url,
  ),
  'utf8',
);

/** A 1.4.0 database with two users holding `coins` and 100 coins. */
async function writeLegacyDatabase(path: string, coins = 250): Promise<void> {
  const legacy = await createDatabaseClient({ dialect: 'sqlite', url: path, autoMigrate: false });
  if (legacy.dialect !== 'sqlite') throw new Error('Expected sqlite');
  legacy.raw.exec(LEGACY_SCHEMA);
  legacy.raw.exec(`
    INSERT INTO guild (id, name, prefix) VALUES ('guild_alpha', 'Alpha Server', '!');
    INSERT INTO "user" (id, username, displayName, coins) VALUES
      ('user_alice', 'Alice', 'Alice', ${coins}),
      ('user_bob', 'Bob', 'Bob', 100);
  `);
  await legacy.close();
}

function captureLog() {
  return { log: vi.fn<(line: string) => void>(), warn: vi.fn(), error: vi.fn() };
}

describe('legacy upgrade', () => {
  let dir: string;
  let legacyPath: string;
  let target: DatabaseClient;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-bot-legacy-'));
    legacyPath = join(dir, 'ririko.db');
    await writeLegacyDatabase(legacyPath);
    target = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
  });

  afterEach(async () => {
    await target.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('runLegacyUpgrade (bot startup)', () => {
    it('does nothing when LEGACY_DATABASE_PATH is unset or the file is absent', async () => {
      const out = captureLog();
      expect(await runLegacyUpgrade(target, {}, out)).toBeNull();
      const absent = await runLegacyUpgrade(
        target,
        { LEGACY_DATABASE_PATH: join(dir, 'none.db') },
        out,
      );
      expect(absent).toEqual({ status: 'no-source' });
      expect(out.log).not.toHaveBeenCalled();
      expect(out.warn).not.toHaveBeenCalled();
    });

    it('migrates once and reports it, then reports the earlier run', async () => {
      const out = captureLog();
      const env = { LEGACY_DATABASE_PATH: legacyPath };

      expect((await runLegacyUpgrade(target, env, out))?.status).toBe('migrated');
      expect(out.log.mock.calls[0]?.[0]).toMatch(
        /^✓ Migrated the 1\.4\.0 database at .*ririko\.db: 2 users, 1 guilds, 350 coins \(batch [0-9a-f-]{36}\)\.$/,
      );

      expect((await runLegacyUpgrade(target, env, out))?.status).toBe('already-migrated');
      expect(out.log.mock.lastCall?.[0]).toMatch(/was already migrated on \d{4}-\d{2}-\d{2}T/);
    });

    it('warns with the manual command when the database already has users', async () => {
      if (target.dialect !== 'sqlite') throw new Error('Expected sqlite');
      target.raw
        .prepare('INSERT INTO users (id, username, created_at, updated_at) VALUES (?, ?, 0, 0)')
        .run('user_new', 'New');
      const out = captureLog();

      const result = await runLegacyUpgrade(target, { LEGACY_DATABASE_PATH: legacyPath }, out);
      expect(result?.status).toBe('target-not-empty');
      expect(out.warn.mock.calls.map((call) => call[0])).toEqual([
        expect.stringContaining('did not migrate it: it already has 1 user.'),
        '  To merge it anyway, stop the bot and run: node apps/bot/dist/legacy-upgrade.js --force',
      ]);
    });
  });

  describe('describeUpgrade', () => {
    it('words a dry run as a preview and lists anomalies', () => {
      const lines = describeUpgrade(
        {
          status: 'dry-run',
          sourceSha256: 'abc',
          migration: {
            batchId: 'batch-1',
            isDryRun: true,
            inspected: {
              tables: {},
              totalCoins: 5n,
              totalKarma: 0n,
              totalUsers: 1,
              totalGuilds: 0,
              anomalies: ['Found 1 users with negative coin balances.'],
            },
            migratedCounts: { users: 1, guilds: 0 },
            coinsConserved: true,
            totalCoinsMigrated: 5n,
            durationMs: 1,
          },
        },
        '/app/legacy/ririko.db',
      );
      expect(lines).toEqual([
        'Would migrate the 1.4.0 database at /app/legacy/ririko.db: 1 users, 0 guilds, 5 coins (batch batch-1).',
        '  users 1',
        '  ⚠ Found 1 users with negative coin balances.',
      ]);
    });
  });

  describe('parseArgs', () => {
    it('reads the flags and the source', () => {
      expect(parseArgs(['--dry-run', '--force', '--source', 'old.db'])).toEqual({
        dryRun: true,
        force: true,
        source: 'old.db',
      });
      expect(parseArgs([])).toEqual({ dryRun: false, force: false, source: undefined });
    });

    it('rejects unknown arguments and a source without a path', () => {
      expect(parseArgs(['--yes'])).toBe('Unknown argument: --yes');
      expect(parseArgs(['--source'])).toBe('Unknown argument: --source');
    });
  });

  describe('main (manual command)', () => {
    it('previews, migrates, then reports the earlier run', async () => {
      const env = { DATABASE_URL: join(dir, 'ririko.sqlite'), LEGACY_DATABASE_PATH: legacyPath };

      const preview = captureLog();
      expect(await main(['--dry-run'], env, preview)).toBe(0);
      expect(preview.log.mock.calls[0]?.[0]).toMatch(/^Would migrate the 1\.4\.0 database/);

      const live = captureLog();
      expect(await main([], env, live)).toBe(0);
      expect(live.log.mock.calls[0]?.[0]).toMatch(/^✓ Migrated the 1\.4\.0 database/);

      const again = captureLog();
      expect(await main(['--source', legacyPath], env, again)).toBe(0);
      expect(again.log.mock.calls[0]?.[0]).toMatch(/was already migrated/);
    });

    it('fails without a source, with a missing file, or with bad arguments', async () => {
      const env = { DATABASE_URL: join(dir, 'ririko.sqlite') };
      const out = captureLog();
      expect(await main([], env, out)).toBe(2);
      expect(out.error.mock.calls[0]?.[0]).toMatch(/No 1\.4\.0 database given/);
      expect(await main(['--source', join(dir, 'none.db')], env, out)).toBe(1);
      expect(out.error.mock.lastCall?.[0]).toMatch(/No 1\.4\.0 database at/);
      expect(await main(['--nope'], env, out)).toBe(2);
    });

    it('fails, writing nothing, when the coin totals would not match', async () => {
      const brokenPath = join(dir, 'broken.db');
      await writeLegacyDatabase(brokenPath, -50);
      const env = { DATABASE_URL: join(dir, 'ririko.sqlite') };
      const out = captureLog();

      expect(await main(['--source', brokenPath], env, out)).toBe(1);
      expect(out.error.mock.calls[0]?.[0]).toMatch(/Legacy coin totals do not match/);

      // The target was not written: the same database can still be migrated once it is fixed.
      const check = captureLog();
      expect(await main(['--source', legacyPath], env, check)).toBe(0);
      expect(check.log.mock.calls[0]?.[0]).toMatch(/^✓ Migrated/);
    });

    it('exits 1 when the target already has users and --force is not given', async () => {
      const env = { DATABASE_URL: join(dir, 'ririko.sqlite') };
      expect(await main(['--source', legacyPath], env, captureLog())).toBe(0);

      const otherPath = join(dir, 'other.db');
      await writeLegacyDatabase(otherPath, 999);
      const out = captureLog();
      expect(await main(['--source', otherPath], env, out)).toBe(1);
      expect(out.log.mock.calls[0]?.[0]).toMatch(/a different 1\.4\.0 database/);
      expect(await main(['--source', otherPath, '--force'], env, captureLog())).toBe(0);
    });
  });
});
