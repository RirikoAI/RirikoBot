import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

const engine = vi.hoisted(() => ({
  migrateArgs: [] as unknown[][],
  verifyArgs: [] as unknown[][],
  migrateResult: {} as Record<string, unknown>,
  verifyResult: {} as Record<string, unknown>,
  migrateError: null as Error | null,
  clientConfigs: [] as unknown[],
  closed: 0,
}));

vi.mock('@ririko/database', () => ({
  createDatabaseClient: async (config: unknown) => {
    engine.clientConfigs.push(config);
    return {
      close: async () => {
        engine.closed += 1;
      },
    };
  },
  migration: {
    MigrationEngine: class {
      async migrate(...args: unknown[]) {
        engine.migrateArgs.push(args);
        if (engine.migrateError) throw engine.migrateError;
        return engine.migrateResult;
      }
      async verify(...args: unknown[]) {
        engine.verifyArgs.push(args);
        return engine.verifyResult;
      }
    },
  },
}));

import { registerMigrateCommand } from './migrate.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

const baseResult = () => ({
  inspected: { totalUsers: 12, totalGuilds: 3, totalCoins: 5000n, totalKarma: 77n },
  migratedCounts: { users: 12, guilds: 3, warnings: 0 },
  notices: ['2 orphan rows skipped'],
  coinsConserved: true,
  totalCoinsMigrated: 5000n,
  batchId: 'batch-xyz',
  durationMs: 42,
});

describe('ririko migrate:legacy and migrate:verify (TASK-1252)', () => {
  let dir: string;
  let source: string;
  let out: string[];

  const output = () => out.join('\n').replace(ANSI, '');

  const run = async (...args: string[]) => {
    const program = new Command();
    program.exitOverride();
    registerMigrateCommand(program);
    await program.parseAsync(['node', 'ririko', ...args]);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-migrate-'));
    source = join(dir, 'legacy.sqlite');
    writeFileSync(source, '');
    out = [];
    engine.migrateArgs = [];
    engine.verifyArgs = [];
    engine.clientConfigs = [];
    engine.migrateError = null;
    engine.closed = 0;
    engine.migrateResult = baseResult();
    engine.verifyResult = {
      ok: true,
      legacyCoins: 5000n,
      targetCoins: 5000n,
      legacyUsers: 12,
      targetUsers: 12,
      message: 'All good',
    };
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      out.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      out.push(args.join(' '));
    });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('migrate:legacy', () => {
    it('exits 1 without touching the target when the source file is missing', async () => {
      await expect(run('migrate:legacy', '--source', join(dir, 'nope.sqlite'))).rejects.toThrow(
        'exit:1',
      );
      expect(output()).toContain('Source database file not found at:');
      expect(engine.clientConfigs).toHaveLength(0);
    });

    it('runs a live migration against a sqlite target and prints the audit', async () => {
      await run('migrate:legacy', '--source', source, '--target', join(dir, 'new.sqlite'));
      expect(engine.clientConfigs).toEqual([{ dialect: 'sqlite', url: join(dir, 'new.sqlite') }]);
      expect(engine.migrateArgs).toHaveLength(1);
      expect(engine.migrateArgs[0]![0]).toBe(source);
      expect(engine.migrateArgs[0]![2]).toEqual({ dryRun: false, batchSize: 500 });

      const text = output();
      expect(text).toContain('LIVE EXECUTION');
      expect(text).toContain('Total Legacy Users:  12');
      expect(text).toContain('Total Legacy Coins:  5000');
      expect(text).toContain('Total Legacy Karma:  77');
      expect(text).toMatch(/✔ users\s+12/);
      expect(text).toMatch(/✔ guilds\s+3/);
      expect(text).not.toMatch(/✔ warnings/);
      expect(text).toContain('⚠ 2 orphan rows skipped');
      expect(text).toContain('PASSED (100% exact match: 5000 credits)');
      expect(text).toContain('Batch ID:  batch-xyz');
      expect(text).toContain('Duration:  42ms');
      expect(text).toContain('Migration completed successfully with zero data loss!');
      expect(engine.closed).toBe(1);
    });

    it('passes dry-run and batch size through and says nothing was modified', async () => {
      await run('migrate:legacy', '--source', source, '--dry-run', '--batch-size', '25');
      expect(engine.migrateArgs[0]![2]).toEqual({ dryRun: true, batchSize: 25 });
      const text = output();
      expect(text).toContain('DRY RUN (Read-Only)');
      expect(text).toContain('Dry-run complete. Zero modifications were made');
      expect(text).not.toContain('Migration completed successfully');
      expect(engine.closed).toBe(1);
    });

    it('selects the postgres dialect for postgres URLs', async () => {
      await run('migrate:legacy', '--source', source, '--target', 'postgres://u:p@db/ririko');
      expect(engine.clientConfigs).toEqual([
        { dialect: 'postgres', url: 'postgres://u:p@db/ririko' },
      ]);
    });

    it('reports a currency conservation failure', async () => {
      engine.migrateResult = { ...baseResult(), coinsConserved: false, totalCoinsMigrated: 4999n };
      await run('migrate:legacy', '--source', source);
      expect(output()).toContain('FAILED (Legacy: 5000, Target: 4999)');
    });

    it('closes the target client when the engine throws', async () => {
      engine.migrateError = new Error('disk full');
      await expect(run('migrate:legacy', '--source', source)).rejects.toThrow('disk full');
      expect(engine.closed).toBe(1);
    });
  });

  describe('migrate:verify', () => {
    it('exits 1 when the source file is missing', async () => {
      await expect(run('migrate:verify', '--source', join(dir, 'nope.sqlite'))).rejects.toThrow(
        'exit:1',
      );
      expect(output()).toContain('Source database file not found at:');
      expect(engine.verifyArgs).toHaveLength(0);
    });

    it('prints a verified report and closes the client', async () => {
      await run('migrate:verify', '--source', source, '--target', join(dir, 'new.sqlite'));
      const text = output();
      expect(text).toContain('VERIFIED OK');
      expect(text).toContain('Legacy Coins: 5000');
      expect(text).toContain('Target Users: 12');
      expect(text).toContain('Message:      All good');
      expect(engine.verifyArgs[0]![0]).toBe(source);
      expect(engine.closed).toBe(1);
    });

    it('exits 1 and still closes the client when verification fails', async () => {
      engine.verifyResult = {
        ok: false,
        legacyCoins: 5000n,
        targetCoins: 10n,
        legacyUsers: 12,
        targetUsers: 1,
        message: 'Coins diverge',
      };
      await expect(
        run('migrate:verify', '--source', source, '--target', 'postgres://db/ririko'),
      ).rejects.toThrow('exit:1');
      expect(output()).toContain('FAILED');
      expect(output()).toContain('Coins diverge');
      expect(engine.clientConfigs).toEqual([{ dialect: 'postgres', url: 'postgres://db/ririko' }]);
      expect(engine.closed).toBe(1);
    });
  });
});
