import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';
import { WebSessionRepository } from './web-session.repository.js';

const T0 = new Date('2026-09-25T00:00:00Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

function sessionRow(id: string, overrides: Partial<{ lastSeenAt: Date; expiresAt: Date }> = {}) {
  return {
    id,
    userId: 'user-1',
    createdAt: T0,
    lastSeenAt: overrides.lastSeenAt ?? T0,
    expiresAt: overrides.expiresAt ?? minutes(720),
    ipAddress: '203.0.113.7',
    userAgent: 'vitest',
    discordAccessToken: 'v1.enc-access',
    discordRefreshToken: 'v1.enc-refresh',
    discordTokenExpiresAt: minutes(60),
  };
}

describe('WebSessionRepository (TASK-1102)', () => {
  let client: SqliteDatabaseClient;
  let repo: WebSessionRepository;

  beforeEach(async () => {
    const raw = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    client.raw.exec(SQLITE_SCHEMA_DDL);
    repo = new WebSessionRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  it('creates, reads and deletes a session by hashed id', async () => {
    const created = await repo.create(sessionRow('hash-a'));
    expect(created.stepUpAt).toBeNull();
    expect((await repo.findById('hash-a'))?.userId).toBe('user-1');
    expect(await repo.delete('hash-a')).toBe(true);
    expect(await repo.delete('hash-a')).toBe(false);
    expect(await repo.findById('hash-a')).toBeNull();
  });

  it('updates last-seen time and Discord tokens', async () => {
    await repo.create(sessionRow('hash-a'));
    await repo.touch('hash-a', minutes(5));
    await repo.updateDiscordTokens('hash-a', {
      discordAccessToken: 'v1.new-access',
      discordRefreshToken: 'v1.new-refresh',
      discordTokenExpiresAt: minutes(120),
    });
    const row = await repo.findById('hash-a');
    expect(row?.lastSeenAt.getTime()).toBe(minutes(5).getTime());
    expect(row?.discordAccessToken).toBe('v1.new-access');
    expect(row?.discordTokenExpiresAt.getTime()).toBe(minutes(120).getTime());
  });

  it('deletes only sessions past absolute expiry or idle cutoff', async () => {
    await repo.create(sessionRow('live', { lastSeenAt: minutes(50) }));
    await repo.create(sessionRow('idle', { lastSeenAt: minutes(10) }));
    await repo.create(sessionRow('absolute', { lastSeenAt: minutes(59), expiresAt: minutes(60) }));

    const removed = await repo.deleteExpired(minutes(60), minutes(30));

    expect(removed).toBe(2);
    expect(await repo.findById('live')).not.toBeNull();
    expect(await repo.findById('idle')).toBeNull();
    expect(await repo.findById('absolute')).toBeNull();
  });
});
