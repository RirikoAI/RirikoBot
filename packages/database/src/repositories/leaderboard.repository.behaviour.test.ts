import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { LeaderboardRepository } from './leaderboard.repository.js';

const T0 = new Date('2026-06-15T00:00:00Z');

const snapshot = (
  userId: string,
  guildId: string,
  serverRank: number,
  globalRank = serverRank,
  overrides: Record<string, unknown> = {},
) => ({ userId, guildId, serverRank, globalRank, ...overrides });

describeDialects('LeaderboardRepository behaviour', (db) => {
  it('creates a snapshot and reads it back by user and guild', async () => {
    const repo = new LeaderboardRepository(db.client);
    const id = { userId: 'u1', guildId: 'g1' };
    expect(await repo.findById(id)).toBeNull();
    expect(await repo.exists(id)).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create(snapshot('u1', 'g1', 3, 7));
    expect(created.serverRank).toBe(3);
    expect(created.globalRank).toBe(7);
    expect(created.calculatedAt).toBeInstanceOf(Date);

    expect((await repo.findById(id))?.serverRank).toBe(3);
    expect(await repo.exists(id)).toBe(true);
    expect(await repo.findById({ userId: 'u1', guildId: 'g2' })).toBeNull();
    expect(await repo.count()).toBe(1);
    await expect(repo.create(snapshot('u1', 'g1', 1))).rejects.toThrow();
  });

  it('keeps an explicit calculation time', async () => {
    const repo = new LeaderboardRepository(db.client);

    const created = await repo.create(snapshot('u1', 'g1', 1, 1, { calculatedAt: T0 }));

    expect(created.calculatedAt.getTime()).toBe(T0.getTime());
  });

  it('updates a snapshot, stamping the calculation time, and throws for a missing one', async () => {
    const repo = new LeaderboardRepository(db.client);
    await repo.create(snapshot('u1', 'g1', 5, 9, { calculatedAt: T0 }));

    const updated = await repo.update({ userId: 'u1', guildId: 'g1' }, { serverRank: 2 });
    expect(updated.serverRank).toBe(2);
    expect(updated.globalRank).toBe(9);
    expect(updated.calculatedAt.getTime()).toBeGreaterThan(T0.getTime());

    const pinned = await repo.update(
      { userId: 'u1', guildId: 'g1' },
      { globalRank: 1, calculatedAt: T0 },
    );
    expect(pinned.calculatedAt.getTime()).toBe(T0.getTime());

    await expect(
      repo.update({ userId: 'ghost', guildId: 'g1' }, { serverRank: 1 }),
    ).rejects.toThrow(DatabaseError);
  });

  it('upserts a batch of snapshots, replacing ranks of existing ones', async () => {
    const repo = new LeaderboardRepository(db.client);
    expect(await repo.upsertBatch([])).toBe(0);

    expect(
      await repo.upsertBatch([
        snapshot('u1', 'g1', 1, 4, { calculatedAt: T0 }),
        snapshot('u2', 'g1', 2, 5, { calculatedAt: T0 }),
      ]),
    ).toBe(2);
    expect(await repo.count()).toBe(2);

    const later = new Date(T0.getTime() + 3_600_000);
    expect(
      await repo.upsertBatch([
        snapshot('u2', 'g1', 1, 2, { calculatedAt: later }),
        snapshot('u3', 'g1', 3, 6, { calculatedAt: later }),
      ]),
    ).toBe(2);

    expect(await repo.count()).toBe(3);
    const moved = await repo.findById({ userId: 'u2', guildId: 'g1' });
    expect(moved?.serverRank).toBe(1);
    expect(moved?.globalRank).toBe(2);
    expect(moved?.calculatedAt.getTime()).toBe(later.getTime());
    expect((await repo.findById({ userId: 'u1', guildId: 'g1' }))?.serverRank).toBe(1);
  });

  it('looks up the precomputed ranks of one user', async () => {
    const repo = new LeaderboardRepository(db.client);
    await repo.create(snapshot('u1', 'g1', 3, 8, { calculatedAt: T0 }));

    const rank = await repo.getUserRank('u1', 'g1');
    expect(rank).toEqual({
      userId: 'u1',
      guildId: 'g1',
      serverRank: 3,
      globalRank: 8,
      calculatedAt: T0,
    });
    expect(await repo.getUserRank('u1', 'g2')).toBeNull();
    expect(await repo.getUserRank('nobody', 'g1')).toBeNull();
  });

  it('pages a server leaderboard by rank and a global one stored under the global guild', async () => {
    const repo = new LeaderboardRepository(db.client);
    await repo.upsertBatch([
      snapshot('c', 'g1', 3),
      snapshot('a', 'g1', 1),
      snapshot('b', 'g1', 2),
      snapshot('other', 'g2', 1),
      snapshot('top', 'global', 1),
      snapshot('next', 'global', 2),
    ]);

    const all = await repo.getServerLeaderboard('g1');
    expect(all.items.map((s) => s.userId)).toEqual(['a', 'b', 'c']);
    expect(all.total).toBe(3);
    expect(all.limit).toBe(10);
    expect(all.offset).toBe(0);

    const page = await repo.getServerLeaderboard('g1', { limit: 1, offset: 1 });
    expect(page.items.map((s) => s.userId)).toEqual(['b']);
    expect(page.total).toBe(3);
    expect((await repo.getServerLeaderboard('nowhere')).items).toEqual([]);

    const global = await repo.getGlobalLeaderboard();
    expect(global.items.map((s) => s.userId)).toEqual(['top', 'next']);
    expect((await repo.getGlobalLeaderboard({ limit: 1 })).items.map((s) => s.userId)).toEqual([
      'top',
    ]);
  });

  it('deletes a snapshot once', async () => {
    const repo = new LeaderboardRepository(db.client);
    await repo.create(snapshot('u1', 'g1', 1));
    await repo.create(snapshot('u1', 'g2', 1));
    const id = { userId: 'u1', guildId: 'g1' };

    expect(await repo.delete(id)).toBe(true);
    expect(await repo.delete(id)).toBe(false);
    expect(await repo.count()).toBe(1);
  });
});
