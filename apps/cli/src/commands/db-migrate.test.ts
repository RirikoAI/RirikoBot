import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { DatabaseError, ValidationError } from '@ririko/core';
import {
  createDatabaseClient,
  MIGRATIONS_TABLE,
  type DatabaseClient,
  type MigrationStatus,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { registerDbMigrateCommand, runDbMigrate, type DbMigrateDeps } from './db-migrate.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;
const plain = (lines: string[]) => lines.map((line) => line.replace(ANSI, '')).join('\n');

describe('ririko db:migrate on a SQLite file', () => {
  let dir: string;
  let file: string;
  let env: Record<string, string>;

  /** Runs `work` on the file through a separate connection. */
  const withFile = async <T>(work: (raw: SqliteDatabaseClient['raw']) => T): Promise<T> => {
    const client = await createDatabaseClient({ dialect: 'sqlite', url: file });
    try {
      if (client.dialect !== 'sqlite') throw new Error('Expected sqlite');
      return work(client.raw);
    } finally {
      await client.close();
    }
  };

  /** Tables of the file (none while the file does not exist). */
  const tables = async (): Promise<string[]> =>
    existsSync(file)
      ? withFile((raw) =>
          (
            raw
              .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
              )
              .all() as { name: string }[]
          ).map((row) => row.name),
        )
      : [];

  const sql = async (statement: string): Promise<void> => {
    await withFile((raw) => raw.exec(statement));
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-db-migrate-'));
    file = join(dir, 'ririko.sqlite');
    env = { DATABASE_DIALECT: 'sqlite', DATABASE_URL: file };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports the state with --status and changes nothing', async () => {
    const result = await runDbMigrate({ status: true }, env);
    expect(result.exitCode).toBe(0);
    const text = plain(result.lines);
    expect(text).toContain('Latest:  0000_baseline');
    expect(text).toContain('Pending: 0000_baseline');
    expect(text).toContain('Unknown: (none)');
    expect(text).toContain('Adopted: no');
    expect(await tables()).toEqual([]);
  });

  it('prints the plan with --dry-run and changes nothing', async () => {
    const result = await runDbMigrate({ dryRun: true }, env);
    expect(result.exitCode).toBe(0);
    const text = plain(result.lines);
    expect(text).toContain('DRY RUN: nothing was changed.');
    expect(text).toContain('Would apply 1 migration(s): 0000_baseline');
    expect(await tables()).toEqual([]);
  });

  it('applies the migrations, prints what ran, and does nothing the second time', async () => {
    const first = await runDbMigrate({}, env);
    expect(first.exitCode).toBe(0);
    const text = plain(first.lines);
    expect(text).toContain('Applied migration 0000_baseline');
    expect(text).toContain('Applied 1 migration(s): 0000_baseline');
    expect(await tables()).toContain(MIGRATIONS_TABLE);
    expect(await tables()).toContain('users');

    const second = await runDbMigrate({}, env);
    expect(second.exitCode).toBe(0);
    expect(plain(second.lines)).toContain(
      'Nothing to do: the database is up to date (0000_baseline)',
    );

    const status = await runDbMigrate({ status: true }, env);
    expect(plain(status.lines)).toContain('Pending: (none)');
  });

  it('adopts a database without migration records, backing it up first', async () => {
    await runDbMigrate({}, env);
    await sql(`DROP TABLE ${MIGRATIONS_TABLE}`);

    const preview = await runDbMigrate({ dryRun: true }, env);
    expect(preview.exitCode).toBe(0);
    expect(plain(preview.lines)).toContain('would record 0000_baseline as applied');
    expect(await tables()).not.toContain(MIGRATIONS_TABLE);

    const adopted = await runDbMigrate({}, env);
    expect(adopted.exitCode).toBe(0);
    const text = plain(adopted.lines);
    expect(text).toContain('recorded 0000_baseline as applied');
    expect(text).toMatch(/Backup: .*pre-migrate-/);
    expect(readdirSync(join(dir, 'backups')).length).toBe(1);

    const status = await runDbMigrate({ status: true }, env);
    expect(plain(status.lines)).toContain('Adopted: yes');
  });

  it('exits with 2 when the downgrade guard refuses, and changes nothing', async () => {
    await runDbMigrate({}, env);
    await sql(
      `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, contract, adopted, applied_at) VALUES ('9999_future_drop', 'x', 1, 0, 0)`,
    );

    const result = await runDbMigrate({}, env);
    expect(result.exitCode).toBe(2);
    expect(plain(result.lines)).toContain('Refused');
    expect(plain(result.lines)).toContain('9999_future_drop');

    const dry = await runDbMigrate({ dryRun: true }, env);
    expect(dry.exitCode).toBe(2);
    const status = await runDbMigrate({ status: true }, env);
    expect(status.exitCode).toBe(0);
    expect(plain(status.lines)).toContain(
      'Unknown: 9999_future_drop (recorded by a newer release)',
    );
  });

  it('refuses --status together with --dry-run', async () => {
    await expect(runDbMigrate({ status: true, dryRun: true }, env)).rejects.toThrow(
      ValidationError,
    );
  });
});

describe('ririko db:migrate failures', () => {
  const PASSWORD = 's3cr3t-p@ss';
  const URL_WITH_SECRET = `postgres://ririko:${encodeURIComponent(PASSWORD)}@db.example.test:6543/ririko_db`;
  const env = { DATABASE_DIALECT: 'postgres', DATABASE_URL: URL_WITH_SECRET };
  const upToDate: MigrationStatus = {
    latest: '0000_baseline',
    pending: [],
    unknown: [],
    unknownContract: [],
    adopted: false,
  };

  const deps = (overrides: Partial<DbMigrateDeps> = {}) => {
    const close = vi.fn(async () => undefined);
    const stub: DbMigrateDeps = {
      open: async () => ({ close }) as unknown as DatabaseClient,
      status: async () => upToDate,
      migrate: async () => ({
        applied: [],
        alreadyApplied: [],
        unknown: [],
        backupPath: null,
        adoption: null,
      }),
      ...overrides,
    };
    return { stub, close };
  };

  it('shows only host, port and database of the target', async () => {
    const { stub } = deps();
    const result = await runDbMigrate({ status: true }, env, stub);
    const text = plain(result.lines);
    expect(text).toContain('PostgreSQL, host db.example.test, port 6543, database ririko_db');
    expect(text).not.toContain(PASSWORD);
  });

  it('exits with 1 when the database cannot be opened, without echoing the password', async () => {
    const { stub } = deps({
      open: async () => {
        throw new Error(`connect failed for ${URL_WITH_SECRET}`);
      },
    });
    const result = await runDbMigrate({}, env, stub);
    expect(result.exitCode).toBe(1);
    const text = plain(result.lines);
    expect(text).toContain('Cannot open the database');
    expect(text).not.toContain(PASSWORD);
  });

  it('exits with 1 on a failed migration, lists the refusal problems and closes the connection', async () => {
    const { stub, close } = deps({
      migrate: async () => {
        throw new DatabaseError('The database cannot be adopted. Nothing was changed.', {
          details: { problems: ['Column a.b is missing and NOT NULL'] },
        });
      },
    });
    const result = await runDbMigrate({ dryRun: true }, env, stub);
    expect(result.exitCode).toBe(1);
    const text = plain(result.lines);
    expect(text).toContain('Migration failed: The database cannot be adopted');
    expect(text).toContain('- Column a.b is missing and NOT NULL');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('passes non-Error failures on', async () => {
    const { stub } = deps({
      status: async () => {
        throw 'boom';
      },
    });
    await expect(runDbMigrate({}, env, stub)).rejects.toBe('boom');
  });

  it('prints the adoption plan and the runner log lines of a dry run', async () => {
    const { stub } = deps({
      migrate: async (_db, options) => {
        options.log.warn('Table extra_table is not in the baseline');
        return {
          applied: ['0001_next'],
          alreadyApplied: [],
          unknown: [],
          backupPath: null,
          adoption: {
            createdTables: ['welcome_texts'],
            addedColumns: ['guilds.note'],
            createdIndexes: [],
            notes: ['Extra column guilds.legacy'],
          },
        };
      },
    });
    const result = await runDbMigrate({ dryRun: true }, env, stub);
    const text = plain(result.lines);
    expect(text).toContain('Table extra_table is not in the baseline');
    expect(text).toContain('1 table(s) created: welcome_texts');
    expect(text).toContain('1 column(s) added: guilds.note');
    expect(text).toContain('0 index(es) created');
    expect(text).toContain('Extra column guilds.legacy');
    expect(text).toContain('Would apply 1 migration(s): 0001_next');
  });
});

describe('ririko db:migrate command', () => {
  let dir: string;
  let out: string[];
  const saved = { dialect: process.env.DATABASE_DIALECT, url: process.env.DATABASE_URL };

  const run = async (...args: string[]) => {
    const program = new Command();
    program.exitOverride();
    registerDbMigrateCommand(program);
    await program.parseAsync(['node', 'ririko', ...args]);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-db-migrate-cmd-'));
    process.env.DATABASE_DIALECT = 'sqlite';
    process.env.DATABASE_URL = join(dir, 'ririko.sqlite');
    out = [];
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      out.push(args.join(' '));
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const [key, value] of [
      ['DATABASE_DIALECT', saved.dialect],
      ['DATABASE_URL', saved.url],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('migrates the database in DATABASE_URL and leaves the exit code at zero', async () => {
    await run('db:migrate');
    expect(plain(out)).toContain('Applied 1 migration(s): 0000_baseline');
    expect(process.exitCode).toBeUndefined();
  });

  it('prints the state with --status', async () => {
    await run('db:migrate', '--status');
    expect(plain(out)).toContain('Pending: 0000_baseline');
    expect(process.exitCode).toBeUndefined();
  });

  it('sets the exit code of a refusal', async () => {
    await run('db:migrate');
    const client = await createDatabaseClient({
      dialect: 'sqlite',
      url: process.env.DATABASE_URL!,
    });
    if (client.dialect !== 'sqlite') throw new Error('Expected sqlite');
    client.raw.exec(
      `INSERT INTO ${MIGRATIONS_TABLE} (id, checksum, contract, adopted, applied_at) VALUES ('9999_future_drop', 'x', 1, 0, 0)`,
    );
    await client.close();
    await run('db:migrate');
    expect(process.exitCode).toBe(2);
  });
});
