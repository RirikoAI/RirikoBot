import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@ririko/core';
import {
  createDatabaseClient,
  erasedMarker,
  userHash,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { createProgram } from '../program.js';
import { eraseUser, formatReport, type UserEraseReport } from './user-erase.js';

const USER = '100000000000000042';
const OTHER = '100000000000000043';
const NOW = new Date('2026-10-18T00:00:00Z');
const MARKER = erasedMarker(USER);

type Values = Record<string, string | number | null>;

/** Inserts one row; every NOT NULL column without a default that `values` omits gets a filler. */
function insertRow(db: SqliteDatabaseClient, table: string, values: Values): void {
  const columns = db.raw.prepare(`PRAGMA table_info("${table}")`).all() as {
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
  }[];
  const row: Values = { ...values };
  for (const column of columns) {
    if (column.name in row || column.notnull === 0 || column.dflt_value !== null) continue;
    row[column.name] = /int|real|num/i.test(column.type) ? 1 : `${table}.${column.name}`;
  }
  const names = Object.keys(row);
  db.raw
    .prepare(
      `INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    )
    .run(...Object.values(row));
}

function seed(db: SqliteDatabaseClient, userId: string, tag: string): void {
  insertRow(db, 'users', { id: userId });
  insertRow(db, 'xp_accounts', { user_id: userId, guild_id: tag });
  insertRow(db, 'reminders', { id: `${tag}-reminder`, user_id: userId });
  insertRow(db, 'economy_transactions', { id: `${tag}-ledger`, user_id: userId });
  insertRow(db, 'moderation_cases', {
    id: `${tag}-case`,
    guild_id: tag,
    case_number: 1,
    target_user_id: userId,
    moderator_user_id: 'moderator',
  });
}

const count = (db: SqliteDatabaseClient, table: string, where = '1 = 1'): number =>
  (db.raw.prepare(`SELECT count(*) AS n FROM "${table}" WHERE ${where}`).get() as { n: number }).n;

describe('ririko user erase (TASK-1941)', () => {
  let db: SqliteDatabaseClient;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    seed(db, USER, 'target');
    seed(db, OTHER, 'other');
  });

  afterEach(async () => {
    await db.close();
  });

  const options = { confirm: false, includeModeration: false, actor: 'cli:test', now: NOW };
  const find = (report: UserEraseReport, table: string, column: string) =>
    report.operations.find((op) => op.table === table && op.column === column);

  it('prints the row count per table and changes nothing without --yes', async () => {
    const report = await eraseUser(db, USER, options);

    expect(report.applied).toBe(false);
    expect(report.hash).toBe(userHash(USER));
    expect(find(report, 'users', 'id')).toMatchObject({ action: 'delete', rows: 1 });
    expect(find(report, 'xp_accounts', 'user_id')).toMatchObject({ action: 'delete', rows: 1 });
    expect(find(report, 'reminders', 'user_id')).toMatchObject({ action: 'delete', rows: 1 });
    expect(find(report, 'economy_transactions', 'user_id')).toMatchObject({
      action: 'tombstone',
      rows: 1,
    });
    expect(find(report, 'moderation_cases', 'target_user_id')).toMatchObject({
      action: 'keep',
      rows: 1,
      optIn: 'moderation',
    });
    expect(count(db, 'users')).toBe(2);
    expect(count(db, 'xp_accounts')).toBe(2);
    expect(count(db, 'audit_logs')).toBe(0);
  });

  it('applies the plan with --yes in one go and audits it without the user ID', async () => {
    const report = await eraseUser(db, USER, { ...options, confirm: true });

    expect(report.applied).toBe(true);
    expect(count(db, 'users', `id = '${USER}'`)).toBe(0);
    expect(count(db, 'users', `id = '${OTHER}'`)).toBe(1);
    expect(count(db, 'xp_accounts', `user_id = '${USER}'`)).toBe(0);
    expect(count(db, 'reminders')).toBe(1);
    expect(count(db, 'economy_transactions', `user_id = '${MARKER}'`)).toBe(1);
    expect(count(db, 'economy_transactions', `user_id = '${OTHER}'`)).toBe(1);
    // Moderation is kept without --include-moderation.
    expect(count(db, 'moderation_cases', `target_user_id = '${USER}'`)).toBe(1);

    const audit = db.raw.prepare('SELECT * FROM audit_logs').all() as Record<string, string>[];
    expect(audit).toHaveLength(1);
    const entry = audit[0]!;
    expect(entry['actor_user_id']).toBe('cli:test');
    expect(entry['action']).toBe('user.erase');
    expect(entry['guild_id']).toBeNull();
    expect(JSON.parse(entry['details']!)).toEqual({
      source: 'cli',
      subject: userHash(USER),
      includeModeration: false,
      deleted: {
        'reminders.user_id': 1,
        'users.id': 1,
        'xp_accounts.user_id': 1,
      },
      tombstoned: { 'economy_transactions.user_id': 1 },
      scrubbed: {},
      cancelledTrades: 0,
      kept: { 'moderation_cases.target_user_id': 1 },
    });
    // Nowhere in the audit log is the raw user ID.
    expect(JSON.stringify(audit)).not.toContain(USER);
    expect(JSON.stringify(audit)).toContain(userHash(USER));
  });

  it('also removes the moderation records with --include-moderation', async () => {
    await eraseUser(db, USER, { ...options, confirm: true, includeModeration: true });

    expect(count(db, 'moderation_cases', `target_user_id = '${USER}'`)).toBe(0);
    expect(count(db, 'moderation_cases', `target_user_id = '${MARKER}'`)).toBe(1);
    const entry = db.raw.prepare('SELECT details FROM audit_logs').get() as { details: string };
    expect(JSON.parse(entry.details)).toMatchObject({
      includeModeration: true,
      tombstoned: {
        'economy_transactions.user_id': 1,
        'moderation_cases.target_user_id': 1,
      },
      kept: {},
    });
  });

  it('is safe to run twice', async () => {
    await eraseUser(db, USER, { ...options, confirm: true });
    const second = await eraseUser(db, USER, { ...options, confirm: true });

    expect(second.operations.filter((op) => op.action !== 'keep' && op.rows > 0)).toEqual([]);
    expect(count(db, 'users')).toBe(1);
    expect(count(db, 'economy_transactions', `user_id = '${MARKER}'`)).toBe(1);
    const entries = db.raw.prepare('SELECT details FROM audit_logs').all() as { details: string }[];
    expect(entries).toHaveLength(2);
    expect(JSON.parse(entries[1]!.details)).toMatchObject({ deleted: {}, tombstoned: {} });
  });

  it('prints zeros for a user with no data', async () => {
    const report = await eraseUser(db, '100000000000000099', options);

    expect(report.operations.every((op) => op.rows === 0)).toBe(true);
    const lines = formatReport(report, '100000000000000099');
    expect(lines.join('\n')).toContain(
      'Rows delete: 0, anonymise: 0, scrub: 0, cancel: 0, keep: 0.',
    );
    // Only the heading, the summary and the --yes hint: no table lines.
    expect(lines).toHaveLength(3);
  });

  it('rejects anything that is not a Discord user ID', async () => {
    for (const bad of ['someone', '42', '']) {
      await expect(eraseUser(db, bad, { ...options, confirm: true })).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    expect(count(db, 'users')).toBe(2);
  });

  describe('formatReport', () => {
    it('lists the rows per table.column and points at --yes and --include-moderation', async () => {
      const report = await eraseUser(db, USER, options);

      const text = formatReport(report, USER).join('\n');

      expect(text).toContain('Nothing has changed yet');
      expect(text).toMatch(/users\.id\s+delete 1/);
      expect(text).toMatch(/economy_transactions\.user_id\s+anonymise 1/);
      expect(text).toMatch(/moderation_cases\.target_user_id\s+keep 1/);
      expect(text).toContain('--include-moderation');
      expect(text).toContain('--yes');
      expect(text).toContain(userHash(USER));
    });

    it('reports past tense after --yes and no longer asks for it', async () => {
      const report = await eraseUser(db, USER, { ...options, confirm: true });

      const text = formatReport(report, USER).join('\n');

      expect(text).toContain('Erased the data of user');
      expect(text).toMatch(/users\.id\s+deleted 1/);
      expect(text).toMatch(/economy_transactions\.user_id\s+anonymised 1/);
      expect(text).not.toContain('Run again with');
    });

    it('shows cancelled trades', () => {
      const report: UserEraseReport = {
        applied: true,
        hash: userHash(USER),
        operations: [{ table: 'card_trades', column: 'status', action: 'cancel', rows: 2 }],
      };

      expect(formatReport(report, USER).join('\n')).toMatch(/card_trades\.status\s+cancelled 2/);
    });
  });
});

describe('ririko user erase (command line)', () => {
  let dir: string;
  let url: string;
  const saved = { url: process.env['DATABASE_URL'], dialect: process.env['DATABASE_DIALECT'] };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-user-erase-'));
    url = join(dir, 'ririko.db');
    const raw = await createDatabaseClient({ dialect: 'sqlite', url, autoMigrate: true });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    seed(raw, USER, 'target');
    await raw.close();
    process.env['DATABASE_URL'] = url;
    process.env['DATABASE_DIALECT'] = 'sqlite';
  });

  afterEach(() => {
    if (saved.url === undefined) delete process.env['DATABASE_URL'];
    else process.env['DATABASE_URL'] = saved.url;
    if (saved.dialect === undefined) delete process.env['DATABASE_DIALECT'];
    else process.env['DATABASE_DIALECT'] = saved.dialect;
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  const run = async (...args: string[]): Promise<string> => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await createProgram().parseAsync(['node', 'ririko', 'user', 'erase', ...args]);
    return log.mock.calls.map((call) => String(call[0])).join('\n');
  };

  const usersLeft = async (): Promise<number> => {
    const raw = await createDatabaseClient({ dialect: 'sqlite', url });
    try {
      return count(raw as SqliteDatabaseClient, 'users');
    } finally {
      await raw.close();
    }
  };

  it('is registered as `user erase` with --yes and --include-moderation', () => {
    const user = createProgram().commands.find((c) => c.name() === 'user');
    const erase = user?.commands.find((c) => c.name() === 'erase');

    expect(erase).toBeDefined();
    expect(erase?.options.map((o) => o.long)).toEqual(['--yes', '--include-moderation']);
  });

  it('only shows the plan without --yes', async () => {
    const out = await run(USER);

    expect(out).toContain('Nothing has changed yet');
    expect(out).toMatch(/users\.id\s+delete 1/);
    expect(await usersLeft()).toBe(1);
  });

  it('erases the user with --yes', async () => {
    const out = await run(USER, '--yes');

    expect(out).toContain('Erased the data of user');
    expect(await usersLeft()).toBe(0);
  });
});
