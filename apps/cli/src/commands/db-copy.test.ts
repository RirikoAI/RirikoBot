import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { DatabaseError, ValidationError } from '@ririko/core';
import type { CopyReport, PostgresDatabaseClient } from '@ririko/database';

const engine = vi.hoisted(() => ({
  clientConfigs: [] as unknown[],
  copyArgs: [] as unknown[][],
  report: null as unknown,
  copyError: null as Error | null,
  closed: 0,
}));

vi.mock('@ririko/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ririko/database')>()),
  createDatabaseClient: async (config: unknown) => {
    engine.clientConfigs.push(config);
    return {
      dialect: 'postgres',
      close: async () => {
        engine.closed += 1;
      },
    };
  },
  copyDatabase: async (...args: unknown[]) => {
    engine.copyArgs.push(args);
    if (engine.copyError) throw engine.copyError;
    return engine.report;
  },
}));

import {
  formatCopyReport,
  registerDbCopyCommand,
  runDbCopy,
  summariseTarget,
  type DbCopyDeps,
} from './db-copy.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;
const plain = (lines: string[]) => lines.map((line) => line.replace(ANSI, '')).join('\n');

const PASSWORD = 's3cr3t-p@ss';
const URL_WITH_SECRET = `postgres://ririko:${encodeURIComponent(PASSWORD)}@db.example.test:6543/ririko_db`;

const goodReport = (overrides: Partial<CopyReport> = {}): CopyReport => ({
  tables: [
    { name: 'users', sourceRows: 12, targetRows: 12 },
    { name: 'economy_balances', sourceRows: 12, targetRows: 12 },
  ],
  warnings: [],
  coinsChecked: true,
  coinTotals: { wallet: '85074', bank: '110000' },
  sequences: [],
  committed: true,
  ...overrides,
});

describe('summariseTarget', () => {
  it('keeps only host, port and database', () => {
    expect(summariseTarget(URL_WITH_SECRET)).toEqual({
      host: 'db.example.test',
      port: '6543',
      database: 'ririko_db',
    });
  });

  it('defaults the port and accepts the postgresql scheme', () => {
    expect(summariseTarget('postgresql://u:p@localhost/ririko')).toEqual({
      host: 'localhost',
      port: '5432',
      database: 'ririko',
    });
  });

  it.each(['not a url', 'mysql://u:p@h/db', 'postgres://u:p@h', 'postgres://u:p@h/'])(
    'rejects %s without echoing it',
    (value) => {
      expect(() => summariseTarget(value)).toThrow(ValidationError);
      try {
        summariseTarget(value);
      } catch (error) {
        expect((error as Error).message).not.toContain(value);
      }
    },
  );
});

describe('formatCopyReport', () => {
  it('prints the plan, the checks and a committed verdict', () => {
    const result = formatCopyReport(
      goodReport({
        warnings: ['table x lacks column y'],
        sequences: [{ table: 'items', column: 'id', value: '42' }],
      }),
      { dryRun: false },
    );
    const text = plain(result.lines);
    expect(result.ok).toBe(true);
    expect(text).toMatch(/✔ users\s+12\s+12/);
    expect(text).toContain('2 table(s), 24 row(s) in the source.');
    expect(text).toContain('wallet 85074, bank 110000 (source and target match)');
    expect(text).toContain('items.id=42');
    expect(text).toContain('⚠ table x lacks column y');
    expect(text).toContain('Copy committed');
  });

  it('says nothing was committed for a dry run', () => {
    const result = formatCopyReport(goodReport({ committed: false, coinTotals: null }), {
      dryRun: true,
    });
    const text = plain(result.lines);
    expect(result.ok).toBe(true);
    expect(text).toContain('Dry run complete');
    expect(text).not.toContain('Economy check');
  });

  it('marks differing counts and fails', () => {
    const result = formatCopyReport(
      goodReport({
        tables: [{ name: 'users', sourceRows: 12, targetRows: 11 }],
        coinsChecked: false,
      }),
      { dryRun: false },
    );
    const text = plain(result.lines);
    expect(result.ok).toBe(false);
    expect(text).toMatch(/✖ users\s+12\s+11/);
    expect(text).toContain('Row counts differ in 1 table(s): users.');
    expect(text).toContain('not compared');
    expect(text).not.toContain('Copy committed');
  });
});

describe('runDbCopy', () => {
  let dir: string;
  let source: string;
  let opened: string[];
  let closed: number;
  let copyCalls: unknown[][];
  let deps: DbCopyDeps;
  let copyResult: CopyReport | Error;
  let openError: Error | null;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-db-copy-'));
    source = join(dir, 'ririko.sqlite');
    writeFileSync(source, '');
    opened = [];
    closed = 0;
    copyCalls = [];
    copyResult = goodReport();
    openError = null;
    deps = {
      openTarget: async (url) => {
        opened.push(url);
        if (openError) throw openError;
        return {
          dialect: 'postgres',
          close: async () => {
            closed += 1;
          },
        } as unknown as PostgresDatabaseClient;
      },
      copy: async (...args) => {
        copyCalls.push(args);
        if (copyResult instanceof Error) throw copyResult;
        return copyResult;
      },
    };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const env = { TARGET_DATABASE_URL: URL_WITH_SECRET };

  it('requires --from', async () => {
    await expect(runDbCopy({ yes: true }, env, deps)).rejects.toThrow('--from');
    expect(opened).toHaveLength(0);
  });

  it('fails with a clear error when TARGET_DATABASE_URL is missing', async () => {
    await expect(runDbCopy({ from: source, yes: true }, {}, deps)).rejects.toThrow(
      'TARGET_DATABASE_URL is not set',
    );
    await expect(
      runDbCopy({ from: source, yes: true }, { TARGET_DATABASE_URL: '' }, deps),
    ).rejects.toThrow('TARGET_DATABASE_URL is not set');
    expect(opened).toHaveLength(0);
  });

  it('refuses a real run without --yes before connecting', async () => {
    await expect(runDbCopy({ from: source }, env, deps)).rejects.toThrow('--yes');
    expect(opened).toHaveLength(0);
  });

  it('rejects a bad batch size, a bad URL and a missing source file', async () => {
    await expect(runDbCopy({ from: source, yes: true, batchSize: 0 }, env, deps)).rejects.toThrow(
      '--batch-size',
    );
    await expect(
      runDbCopy({ from: source, yes: true, batchSize: Number.NaN }, env, deps),
    ).rejects.toThrow('--batch-size');
    await expect(
      runDbCopy({ from: source, yes: true }, { TARGET_DATABASE_URL: 'nope' }, deps),
    ).rejects.toThrow('not a valid PostgreSQL URL');
    await expect(
      runDbCopy({ from: join(dir, 'missing.sqlite'), yes: true }, env, deps),
    ).rejects.toThrow('Source database file not found');
    expect(opened).toHaveLength(0);
  });

  it('prints only host, port and database, never the user or password', async () => {
    const result = await runDbCopy({ from: source, yes: true }, env, deps);
    const text = plain(result.lines);
    expect(result.ok).toBe(true);
    expect(text).toContain('host db.example.test, port 6543, database ririko_db');
    expect(text).toContain('LIVE COPY');
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(encodeURIComponent(PASSWORD));
    expect(text).not.toContain('ririko:');
    expect(opened).toEqual([URL_WITH_SECRET]);
    expect(copyCalls[0]![2]).toEqual({ dryRun: false, batchSize: undefined });
    expect(closed).toBe(1);
  });

  it('runs a dry run without --yes and passes dryRun and the batch size on', async () => {
    copyResult = goodReport({ committed: false });
    const result = await runDbCopy({ from: source, dryRun: true, batchSize: 25 }, env, deps);
    const text = plain(result.lines);
    expect(result.ok).toBe(true);
    expect(text).toContain('DRY RUN (rolled back)');
    expect(text).toContain('Dry run complete');
    expect(copyCalls[0]![2]).toEqual({ dryRun: true, batchSize: 25 });
    expect(closed).toBe(1);
  });

  it('reports a refusal with its reason, scrubbed of the password, and fails', async () => {
    copyResult = new DatabaseError(
      `The target already has rows in users (${URL_WITH_SECRET} / ${PASSWORD}).`,
    );
    const result = await runDbCopy({ from: source, dryRun: true }, env, deps);
    const text = plain(result.lines);
    expect(result.ok).toBe(false);
    expect(text).toContain('✖ Refused: The target already has rows in users');
    expect(text).toContain('Nothing was committed to the target.');
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain('ririko:');
    expect(closed).toBe(1);
  });

  it('reports an unexpected engine failure as a failed copy', async () => {
    copyResult = new Error('connection reset');
    const result = await runDbCopy({ from: source, yes: true }, env, deps);
    expect(result.ok).toBe(false);
    expect(plain(result.lines)).toContain('✖ Copy failed: connection reset');
  });

  it('rethrows a non-error rejection', async () => {
    deps.copy = async () => {
      throw 'boom';
    };
    await expect(runDbCopy({ from: source, yes: true }, env, deps)).rejects.toBe('boom');
    expect(closed).toBe(1);
  });

  it('fails on a connection error without leaking the password', async () => {
    openError = new Error(`getaddrinfo ENOTFOUND (${PASSWORD})`);
    const result = await runDbCopy({ from: source, yes: true }, env, deps);
    const text = plain(result.lines);
    expect(result.ok).toBe(false);
    expect(text).toContain('Cannot connect to the target');
    expect(text).not.toContain(PASSWORD);
    expect(copyCalls).toHaveLength(0);
  });

  it('fails on a count mismatch', async () => {
    copyResult = goodReport({ tables: [{ name: 'users', sourceRows: 3, targetRows: 2 }] });
    const result = await runDbCopy({ from: source, yes: true }, env, deps);
    expect(result.ok).toBe(false);
  });
});

describe('ririko db:copy command', () => {
  let dir: string;
  let source: string;
  let out: string[];
  let savedUrl: string | undefined;

  const run = async (...args: string[]) => {
    const program = new Command();
    program.exitOverride();
    registerDbCopyCommand(program);
    await program.parseAsync(['node', 'ririko', ...args]);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-db-copy-cmd-'));
    source = join(dir, 'ririko.sqlite');
    writeFileSync(source, '');
    out = [];
    engine.clientConfigs = [];
    engine.copyArgs = [];
    engine.report = goodReport();
    engine.copyError = null;
    engine.closed = 0;
    savedUrl = process.env.TARGET_DATABASE_URL;
    process.env.TARGET_DATABASE_URL = URL_WITH_SECRET;
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      out.push(args.join(' '));
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (savedUrl === undefined) delete process.env.TARGET_DATABASE_URL;
    else process.env.TARGET_DATABASE_URL = savedUrl;
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('copies through the engine and leaves the exit code at zero', async () => {
    await run('db:copy', '--from', source, '--yes');
    expect(engine.clientConfigs).toEqual([{ dialect: 'postgres', url: URL_WITH_SECRET }]);
    expect(engine.copyArgs[0]![2]).toEqual({ dryRun: false, batchSize: undefined });
    expect(plain(out)).toContain('Copy committed');
    expect(process.exitCode).toBeUndefined();
    expect(engine.closed).toBe(1);
  });

  it('passes --dry-run and --batch-size through', async () => {
    await run('db:copy', '--from', source, '--dry-run', '--batch-size', '10');
    expect(engine.copyArgs[0]![2]).toEqual({ dryRun: true, batchSize: 10 });
  });

  it('sets a non-zero exit code on a refusal', async () => {
    engine.copyError = new DatabaseError('The target is not empty.');
    await run('db:copy', '--from', source, '--dry-run');
    expect(plain(out)).toContain('Refused: The target is not empty.');
    expect(process.exitCode).toBe(1);
  });

  it('throws before connecting when the URL is missing or --yes is absent', async () => {
    delete process.env.TARGET_DATABASE_URL;
    await expect(run('db:copy', '--from', source, '--yes')).rejects.toThrow(
      'TARGET_DATABASE_URL is not set',
    );
    process.env.TARGET_DATABASE_URL = URL_WITH_SECRET;
    await expect(run('db:copy', '--from', source)).rejects.toThrow('--yes');
    expect(engine.clientConfigs).toHaveLength(0);
  });

  it('does not accept the target URL as an argument', async () => {
    await expect(run('db:copy', '--from', source, '--target', URL_WITH_SECRET)).rejects.toThrow(
      'unknown option',
    );
  });
});
