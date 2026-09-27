import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { withTransaction } from '../transactions/index.js';
import { WebPasskeyRepository } from './web-passkey.repository.js';

const USER = '100000000000000042';
const OTHER = '100000000000000043';
const CREATED = new Date('2026-09-25T00:00:00Z');

describe('WebPasskeyRepository (TASK-1171)', () => {
  let db: SqliteDatabaseClient;
  let repo: WebPasskeyRepository;

  const passkey = (id: string, userId: string, minutes: number) => ({
    id,
    userId,
    name: `Key ${id}`,
    publicKey: `pk-${id}`,
    counter: 0,
    transports: ['internal'],
    deviceType: 'multiDevice',
    backedUp: false,
    createdAt: new Date(CREATED.getTime() + minutes * 60_000),
  });

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    repo = new WebPasskeyRepository(db);

    await repo.create(passkey('cred-b', USER, 5));
    await repo.create(passkey('cred-a', USER, 1));
    await repo.create(passkey('cred-c', OTHER, 2));
  });

  afterEach(async () => {
    await db.close();
  });

  it('stores passkeys and lists a user’s keys oldest first', async () => {
    const keys = await repo.listByUser(USER);
    expect(keys.map((k) => k.id)).toEqual(['cred-a', 'cred-b']);
    expect(keys[0]).toMatchObject({
      name: 'Key cred-a',
      publicKey: 'pk-cred-a',
      transports: ['internal'],
      backedUp: false,
      lastUsedAt: null,
    });
    expect(await repo.countByUser(USER)).toBe(2);
    expect(await repo.countByUser('nobody')).toBe(0);
  });

  it('finds a passkey only for its owner', async () => {
    expect((await repo.findForUser(USER, 'cred-a'))?.userId).toBe(USER);
    expect(await repo.findForUser(OTHER, 'cred-a')).toBeNull();
    expect(await repo.findForUser(USER, 'missing')).toBeNull();
  });

  it('records a sign-in with the new counter', async () => {
    const lastUsedAt = new Date('2026-09-26T08:00:00Z');
    await repo.recordUse('cred-a', { counter: 7, backedUp: true, lastUsedAt });

    expect(await repo.findForUser(USER, 'cred-a')).toMatchObject({
      counter: 7,
      backedUp: true,
      lastUsedAt,
    });
  });

  it('deletes one key only for its owner', async () => {
    expect(await repo.deleteForUser(OTHER, 'cred-a')).toBe(false);
    expect(await repo.deleteForUser(USER, 'cred-a')).toBe(true);
    expect(await repo.deleteForUser(USER, 'cred-a')).toBe(false);
    expect(await repo.countByUser(USER)).toBe(1);
  });

  it('deletes every key of one user', async () => {
    expect(await repo.deleteByUser(USER)).toBe(2);
    expect(await repo.countByUser(USER)).toBe(0);
    expect(await repo.countByUser(OTHER)).toBe(1);
  });

  it('uses the transaction client it is given', async () => {
    await withTransaction(db, async (tx) => {
      await repo.create(passkey('cred-d', USER, 9), tx);
      expect(await repo.countByUser(USER, tx)).toBe(3);
    });
    expect(await repo.countByUser(USER)).toBe(3);
  });
});
