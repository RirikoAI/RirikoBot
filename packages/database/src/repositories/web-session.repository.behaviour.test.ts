import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { WebSessionRepository } from './web-session.repository.js';

const T0 = new Date('2026-09-25T00:00:00Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

function sessionRow(id: string, userId = 'user-1', overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId,
    createdAt: T0,
    lastSeenAt: T0,
    expiresAt: minutes(720),
    ipAddress: '203.0.113.7',
    userAgent: 'vitest',
    discordAccessToken: 'v1.enc-access',
    discordRefreshToken: 'v1.enc-refresh',
    discordTokenExpiresAt: minutes(60),
    ...overrides,
  };
}

describeDialects('WebSessionRepository behaviour', (db) => {
  it('lists the sessions of one user, most recently used first', async () => {
    const repo = new WebSessionRepository(db.client);
    await repo.create(sessionRow('old', 'user-1', { lastSeenAt: minutes(1) }));
    await repo.create(sessionRow('fresh', 'user-1', { lastSeenAt: minutes(9) }));
    await repo.create(sessionRow('middle', 'user-1', { lastSeenAt: minutes(5) }));
    await repo.create(sessionRow('stranger', 'user-2'));

    expect((await repo.listByUser('user-1')).map((s) => s.id)).toEqual(['fresh', 'middle', 'old']);
    expect(await repo.listByUser('nobody')).toEqual([]);
  });

  it('rejects a second session with the same id', async () => {
    const repo = new WebSessionRepository(db.client);
    await repo.create(sessionRow('dup'));

    await expect(repo.create(sessionRow('dup'))).rejects.toThrow();
  });

  it('patches a session, including renaming its id on rotation', async () => {
    const repo = new WebSessionRepository(db.client);
    await repo.create(sessionRow('before'));

    expect(await repo.update('before', { id: 'after', stepUpAt: minutes(3) })).toBe(true);
    expect(await repo.findById('before')).toBeNull();
    expect((await repo.findById('after'))?.stepUpAt?.getTime()).toBe(minutes(3).getTime());
    expect(await repo.update('missing', { lastSeenAt: minutes(1) })).toBe(false);
  });

  it('consumes a challenge once, and only before it expires', async () => {
    const repo = new WebSessionRepository(db.client);
    await repo.create(
      sessionRow('s1', 'user-1', {
        webauthnChallenge: 'challenge-a',
        webauthnChallengeExpiresAt: minutes(5),
      }),
    );

    expect(await repo.consumeChallenge('s1', 'wrong', minutes(1))).toBe(false);
    expect(await repo.consumeChallenge('other', 'challenge-a', minutes(1))).toBe(false);
    expect(await repo.consumeChallenge('s1', 'challenge-a', minutes(1))).toBe(true);
    expect(await repo.consumeChallenge('s1', 'challenge-a', minutes(1))).toBe(false);
    const after = await repo.findById('s1');
    expect(after?.webauthnChallenge).toBeNull();
    expect(after?.webauthnChallengeExpiresAt).toBeNull();

    await repo.update('s1', {
      webauthnChallenge: 'challenge-b',
      webauthnChallengeExpiresAt: minutes(5),
    });
    expect(await repo.consumeChallenge('s1', 'challenge-b', minutes(6))).toBe(false);
    expect((await repo.findById('s1'))?.webauthnChallenge).toBe('challenge-b');
  });

  it('deletes a session only for its owner', async () => {
    const repo = new WebSessionRepository(db.client);
    await repo.create(sessionRow('s1', 'user-1'));

    expect(await repo.deleteForUser('user-2', 's1')).toBe(false);
    expect(await repo.findById('s1')).not.toBeNull();
    expect(await repo.deleteForUser('user-1', 's1')).toBe(true);
    expect(await repo.deleteForUser('user-1', 's1')).toBe(false);
  });

  it('ends every other session of a user, or all of them', async () => {
    const repo = new WebSessionRepository(db.client);
    await repo.create(sessionRow('keep', 'user-1'));
    await repo.create(sessionRow('a', 'user-1'));
    await repo.create(sessionRow('b', 'user-1'));
    await repo.create(sessionRow('other', 'user-2'));

    expect(await repo.deleteOthersForUser('user-1', 'keep')).toBe(2);
    expect((await repo.listByUser('user-1')).map((s) => s.id)).toEqual(['keep']);
    expect(await repo.deleteOthersForUser('user-1', 'keep')).toBe(0);

    expect(await repo.deleteByUser('user-1')).toBe(1);
    expect(await repo.deleteByUser('user-1')).toBe(0);
    expect(await repo.findById('other')).not.toBeNull();
  });
});
