import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '@ririko/core';
import {
  createDatabaseClient,
  WebPasskeyRepository,
  WebSessionRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { resetPasskeys } from './passkeys-reset.js';

const USER = '100000000000000042';
const OTHER = '100000000000000043';
const NOW = new Date('2026-09-25T00:00:00Z');

describe('ririko passkeys:reset (TASK-1174)', () => {
  let db: SqliteDatabaseClient;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    const passkeys = new WebPasskeyRepository(db);
    const sessions = new WebSessionRepository(db);
    for (const [id, userId] of [
      ['cred-a', USER],
      ['cred-b', USER],
      ['cred-c', OTHER],
    ] as const) {
      await passkeys.create({
        id,
        userId,
        name: id,
        publicKey: 'pk',
        counter: 0,
        transports: [],
        deviceType: 'singleDevice',
        backedUp: false,
        createdAt: NOW,
      });
      await sessions.create({
        id: `session-${id}`,
        userId,
        createdAt: NOW,
        lastSeenAt: NOW,
        expiresAt: NOW,
        discordAccessToken: 'x',
        discordRefreshToken: 'x',
        discordTokenExpiresAt: NOW,
      });
    }
  });

  afterEach(async () => {
    await db.close();
  });

  it('only reports what would change without --yes', async () => {
    const result = await resetPasskeys(db, USER, { confirm: false, actor: 'cli:test' });
    expect(result).toEqual({ passkeysRemoved: 2, sessionsEnded: 0 });
    expect(await new WebPasskeyRepository(db).countByUser(USER)).toBe(2);
  });

  it("removes the user's passkeys and sessions, leaves others alone, and audits it", async () => {
    const result = await resetPasskeys(db, USER, { confirm: true, actor: 'cli:test', now: NOW });

    expect(result).toEqual({ passkeysRemoved: 2, sessionsEnded: 2 });
    expect(await new WebPasskeyRepository(db).countByUser(USER)).toBe(0);
    expect(await new WebPasskeyRepository(db).countByUser(OTHER)).toBe(1);
    expect(await new WebSessionRepository(db).findById('session-cred-c')).not.toBeNull();

    const audit = db.raw.prepare('SELECT actor_user_id, action, details FROM audit_logs').get() as {
      actor_user_id: string;
      action: string;
      details: string;
    };
    expect(audit.actor_user_id).toBe('cli:test');
    expect(audit.action).toBe('web.passkey.reset');
    expect(JSON.parse(audit.details)).toEqual({
      source: 'cli',
      userId: USER,
      passkeysRemoved: 2,
      sessionsEnded: 2,
    });
  });

  it('rejects malformed user IDs', async () => {
    await expect(
      resetPasskeys(db, 'someone', { confirm: true, actor: 'cli:test' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
