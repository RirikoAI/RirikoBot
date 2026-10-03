import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { withTransaction } from '../transactions/index.js';
import { WebPasskeyRepository } from './web-passkey.repository.js';

const USER = '100000000000000042';
const OTHER = '100000000000000043';
const CREATED = new Date('2026-09-25T00:00:00Z');

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

describeDialects('WebPasskeyRepository behaviour', (db) => {
  async function seeded() {
    const repo = new WebPasskeyRepository(db.client);
    await repo.create(passkey('cred-b', USER, 5));
    await repo.create(passkey('cred-a', USER, 1));
    await repo.create(passkey('cred-c', OTHER, 2));
    return repo;
  }

  it('stores passkeys and lists the keys of a user oldest first', async () => {
    const repo = await seeded();

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
    expect(await repo.listByUser('nobody')).toEqual([]);
    await expect(repo.create(passkey('cred-a', OTHER, 9))).rejects.toThrow();
  });

  it('finds a passkey only for its owner', async () => {
    const repo = await seeded();

    expect((await repo.findForUser(USER, 'cred-a'))?.userId).toBe(USER);
    expect(await repo.findForUser(OTHER, 'cred-a')).toBeNull();
    expect(await repo.findForUser(USER, 'missing')).toBeNull();
  });

  it('records a sign-in with the new counter', async () => {
    const repo = await seeded();
    const lastUsedAt = new Date('2026-09-26T08:00:00Z');

    await repo.recordUse('cred-a', { counter: 7, backedUp: true, lastUsedAt });

    expect(await repo.findForUser(USER, 'cred-a')).toMatchObject({
      counter: 7,
      backedUp: true,
      lastUsedAt,
    });
  });

  it('deletes one key only for its owner', async () => {
    const repo = await seeded();

    expect(await repo.deleteForUser(OTHER, 'cred-a')).toBe(false);
    expect(await repo.deleteForUser(USER, 'cred-a')).toBe(true);
    expect(await repo.deleteForUser(USER, 'cred-a')).toBe(false);
    expect(await repo.countByUser(USER)).toBe(1);
  });

  it('deletes every key of one user', async () => {
    const repo = await seeded();

    expect(await repo.deleteByUser(USER)).toBe(2);
    expect(await repo.deleteByUser(USER)).toBe(0);
    expect(await repo.countByUser(OTHER)).toBe(1);
  });

  it('uses the transaction client it is given, rolling back with it', async () => {
    const repo = await seeded();

    await withTransaction(db.client, async (tx) => {
      await repo.create(passkey('cred-d', USER, 9), tx);
      expect(await repo.countByUser(USER, tx)).toBe(3);
    });
    expect(await repo.countByUser(USER)).toBe(3);

    await expect(
      withTransaction(db.client, async (tx) => {
        await repo.create(passkey('cred-e', USER, 10), tx);
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await repo.countByUser(USER)).toBe(3);
  });
});
