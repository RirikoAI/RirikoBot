import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const holder = vi.hoisted(() => ({
  db: null as unknown,
  closed: 0,
  username: 'alice' as string | Error,
}));

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    userInfo: () => {
      if (holder.username instanceof Error) throw holder.username;
      return { username: holder.username };
    },
  };
});

vi.mock('@ririko/database', async () => {
  const actual = await vi.importActual<typeof import('@ririko/database')>('@ririko/database');
  return {
    ...actual,
    databaseConfigFromEnv: () => ({ dialect: 'sqlite', url: ':memory:' }),
    createDatabaseClient: async () => holder.db,
  };
});

import {
  WebPasskeyRepository,
  WebSessionRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { registerPasskeysResetCommand } from './passkeys-reset.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

const USER = '100000000000000042';
const NOW = new Date('2026-09-25T00:00:00Z');

describe('ririko passkeys:reset command (TASK-1252)', () => {
  let db: SqliteDatabaseClient;
  let out: string[];

  const output = () => out.join('\n').replace(ANSI, '');

  const run = async (...args: string[]) => {
    const program = new Command();
    program.exitOverride();
    registerPasskeysResetCommand(program);
    await program.parseAsync(['node', 'ririko', 'passkeys:reset', ...args]);
  };

  beforeEach(async () => {
    out = [];
    holder.closed = 0;
    holder.username = 'alice';
    const actual = await vi.importActual<typeof import('@ririko/database')>('@ririko/database');
    const raw = await actual.createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    // Keep the database usable after the command's own close() so the test can inspect it.
    const close = db.close.bind(db);
    db.close = async () => {
      holder.closed += 1;
    };
    (db as unknown as { realClose: () => Promise<void> }).realClose = close;
    holder.db = db;

    await new WebPasskeyRepository(db).create({
      id: 'cred-a',
      userId: USER,
      name: 'laptop',
      publicKey: 'pk',
      counter: 0,
      transports: [],
      deviceType: 'singleDevice',
      backedUp: false,
      createdAt: NOW,
    });
    await new WebSessionRepository(db).create({
      id: 'session-a',
      userId: USER,
      createdAt: NOW,
      lastSeenAt: NOW,
      expiresAt: NOW,
      discordAccessToken: 'x',
      discordRefreshToken: 'x',
      discordTokenExpiresAt: NOW,
    });
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      out.push(args.join(' '));
    });
  });

  afterEach(async () => {
    await (db as unknown as { realClose: () => Promise<void> }).realClose();
    vi.restoreAllMocks();
  });

  it('only reports the passkey count without --yes and changes nothing', async () => {
    await run(USER);
    expect(output()).toContain(`User ${USER} has 1 passkey(s). Run again with --yes`);
    expect(await new WebPasskeyRepository(db).countByUser(USER)).toBe(1);
    expect(await new WebSessionRepository(db).findById('session-a')).not.toBeNull();
    expect(holder.closed).toBe(1);
  });

  it('removes passkeys and sessions with --yes and records the OS user as actor', async () => {
    await run(USER, '--yes');
    expect(output()).toContain(`Removed 1 passkey(s) and ended 1 session(s) for ${USER}`);
    expect(await new WebPasskeyRepository(db).countByUser(USER)).toBe(0);
    expect(await new WebSessionRepository(db).findById('session-a')).toBeNull();
    const audit = db.raw.prepare('SELECT actor_user_id, action FROM audit_logs').get() as {
      actor_user_id: string;
      action: string;
    };
    expect(audit).toEqual({ actor_user_id: 'cli:alice', action: 'web.passkey.reset' });
    expect(holder.closed).toBe(1);
  });

  it('falls back to a bare "cli" actor when the OS user cannot be read', async () => {
    holder.username = new Error('no passwd entry');
    await run(USER, '--yes');
    const audit = db.raw.prepare('SELECT actor_user_id FROM audit_logs').get() as {
      actor_user_id: string;
    };
    expect(audit.actor_user_id).toBe('cli');
  });

  it('rejects a malformed user ID and still closes the database', async () => {
    await expect(run('not-an-id', '--yes')).rejects.toThrow('is not a Discord user ID');
    expect(await new WebPasskeyRepository(db).countByUser(USER)).toBe(1);
    expect(holder.closed).toBe(1);
  });
});
