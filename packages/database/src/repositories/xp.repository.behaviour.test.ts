import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { XpRepository } from './xp.repository.js';

describeDialects('XpRepository behaviour', (db) => {
  it('creates an account and reads it back by user and guild', async () => {
    const repo = new XpRepository(db.client);
    expect(await repo.findById({ userId: 'u1', guildId: 'g1' })).toBeNull();
    expect(await repo.getAccount('u1', 'g1')).toBeNull();
    expect(await repo.exists({ userId: 'u1', guildId: 'g1' })).toBe(false);
    expect(await repo.count()).toBe(0);

    const created = await repo.create({ userId: 'u1', guildId: 'g1', xp: 120, level: 2 });
    expect(Number(created.xp)).toBe(120);
    expect(created.level).toBe(2);
    expect(created.karma).toBe(0);
    expect(created.createdAt).toBeInstanceOf(Date);

    expect(Number((await repo.getAccount('u1', 'g1'))?.xp)).toBe(120);
    expect(await repo.exists({ userId: 'u1', guildId: 'g1' })).toBe(true);
    expect(await repo.getAccount('u1', 'g2')).toBeNull();
    expect(await repo.count()).toBe(1);
    await expect(repo.create({ userId: 'u1', guildId: 'g1' })).rejects.toThrow();
  });

  it('gets or creates a zeroed account without disturbing an existing one', async () => {
    const repo = new XpRepository(db.client);

    const fresh = await repo.getOrCreateAccount('u1', 'g1');
    expect(Number(fresh.xp)).toBe(0);
    expect(fresh.level).toBe(0);
    expect(fresh.karma).toBe(0);

    await repo.updateAccount('u1', 'g1', { xp: 55 });
    expect(Number((await repo.getOrCreateAccount('u1', 'g1')).xp)).toBe(55);
    expect(await repo.count()).toBe(1);
  });

  it('updates an account and throws for a missing one', async () => {
    const repo = new XpRepository(db.client);
    await repo.create({ userId: 'u1', guildId: 'g1' });

    const updated = await repo.update({ userId: 'u1', guildId: 'g1' }, { xp: 300, level: 4 });
    expect(Number(updated.xp)).toBe(300);
    expect(updated.level).toBe(4);
    const levelOnly = await repo.updateAccount('u1', 'g1', { level: 5 });
    expect(Number(levelOnly.xp)).toBe(300);
    expect(levelOnly.level).toBe(5);

    await expect(repo.updateAccount('ghost', 'g1', { xp: 1 })).rejects.toThrow(DatabaseError);
  });

  it('adds xp with a ledger event, never dropping below zero, and updates the level', async () => {
    const repo = new XpRepository(db.client);

    const first = await repo.addXp({ userId: 'u1', guildId: 'g1', xpDelta: 150, source: 'chat' });
    expect(Number(first.account.xp)).toBe(150);
    expect(first.account.level).toBe(0);
    expect(first.account.lastXpAt).toBeInstanceOf(Date);
    expect(Number(first.event.xpAwarded)).toBe(150);
    expect(first.event.source).toBe('chat');

    const levelled = await repo.addXp({
      userId: 'u1',
      guildId: 'g1',
      xpDelta: 100,
      source: 'voice',
      newLevel: 3,
    });
    expect(Number(levelled.account.xp)).toBe(250);
    expect(levelled.account.level).toBe(3);

    const penalised = await repo.addXp({
      userId: 'u1',
      guildId: 'g1',
      xpDelta: -1000,
      source: 'penalty',
    });
    expect(Number(penalised.account.xp)).toBe(0);
    expect(penalised.account.level).toBe(3);
    expect(Number(penalised.event.xpAwarded)).toBe(-1000);
  });

  it('adds, subtracts and sets karma', async () => {
    const repo = new XpRepository(db.client);

    expect((await repo.addKarma('u1', 'g1', 5)).karma).toBe(5);
    expect((await repo.addKarma('u1', 'g1', -2)).karma).toBe(3);
    expect((await repo.setKarma('u1', 'g1', 42)).karma).toBe(42);
    expect((await repo.setKarma('u2', 'g1', -7)).karma).toBe(-7);
  });

  it('lists the guild accounts by xp and the distinct guilds with accounts', async () => {
    const repo = new XpRepository(db.client);
    await repo.create({ userId: 'low', guildId: 'g1', xp: 10 });
    await repo.create({ userId: 'high', guildId: 'g1', xp: 900 });
    await repo.create({ userId: 'mid', guildId: 'g1', xp: 300 });
    await repo.create({ userId: 'other', guildId: 'g2', xp: 5000 });

    expect((await repo.getAllGuildAccounts('g1')).map((a) => a.userId)).toEqual([
      'high',
      'mid',
      'low',
    ]);
    expect(await repo.getAllGuildAccounts('g3')).toEqual([]);
    expect((await repo.getDistinctGuildIds()).sort()).toEqual(['g1', 'g2']);
  });

  it('pages the guild leaderboard with a total', async () => {
    const repo = new XpRepository(db.client);
    for (const [user, xp] of [
      ['a', 10],
      ['b', 40],
      ['c', 30],
      ['d', 20],
    ] as const)
      await repo.create({ userId: user, guildId: 'g1', xp });
    await repo.create({ userId: 'z', guildId: 'g2', xp: 999 });

    const all = await repo.getLeaderboard('g1');
    expect(all.items.map((a) => a.userId)).toEqual(['b', 'c', 'd', 'a']);
    expect(all.total).toBe(4);
    expect(all.limit).toBe(20);
    expect(all.offset).toBe(0);

    const page = await repo.getLeaderboard('g1', { limit: 2, offset: 1 });
    expect(page.items.map((a) => a.userId)).toEqual(['c', 'd']);
    expect(page.total).toBe(4);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(1);
    expect((await repo.getLeaderboard('nowhere')).items).toEqual([]);
  });

  it('sums a user xp across guilds and totals every user', async () => {
    const repo = new XpRepository(db.client);
    await repo.create({ userId: 'u1', guildId: 'g1', xp: 100 });
    await repo.create({ userId: 'u1', guildId: 'g2', xp: 250 });
    await repo.create({ userId: 'u2', guildId: 'g1', xp: 500 });
    await repo.create({ userId: 'u3', guildId: 'g1', xp: 20 });

    expect(await repo.getUserTotalXp('u1')).toBe(350);
    expect(await repo.getUserTotalXp('nobody')).toBe(0);
    expect(await repo.getGlobalUserXpTotals()).toEqual([
      { userId: 'u2', totalXp: 500 },
      { userId: 'u1', totalXp: 350 },
      { userId: 'u3', totalXp: 20 },
    ]);
  });

  it('ranks a user inside a guild, with ties sharing a rank', async () => {
    const repo = new XpRepository(db.client);
    await repo.create({ userId: 'first', guildId: 'g1', xp: 900 });
    await repo.create({ userId: 'tie_a', guildId: 'g1', xp: 300 });
    await repo.create({ userId: 'tie_b', guildId: 'g1', xp: 300 });
    await repo.create({ userId: 'last', guildId: 'g1', xp: 5 });
    await repo.create({ userId: 'first', guildId: 'g2', xp: 1 });

    expect(await repo.getUserGuildRank('first', 'g1')).toEqual({ rank: 1, totalUsers: 4 });
    expect(await repo.getUserGuildRank('tie_a', 'g1')).toEqual({ rank: 2, totalUsers: 4 });
    expect(await repo.getUserGuildRank('tie_b', 'g1')).toEqual({ rank: 2, totalUsers: 4 });
    expect(await repo.getUserGuildRank('last', 'g1')).toEqual({ rank: 4, totalUsers: 4 });
    expect(await repo.getUserGuildRank('first', 'g2')).toEqual({ rank: 1, totalUsers: 1 });
    expect(await repo.getUserGuildRank('nobody', 'g1')).toBeNull();
  });

  it('ranks a user across every guild by total xp', async () => {
    const repo = new XpRepository(db.client);
    await repo.create({ userId: 'u1', guildId: 'g1', xp: 100 });
    await repo.create({ userId: 'u1', guildId: 'g2', xp: 250 });
    await repo.create({ userId: 'u2', guildId: 'g1', xp: 500 });
    await repo.create({ userId: 'u3', guildId: 'g1', xp: 20 });

    expect(await repo.getUserGlobalRank('u2')).toEqual({ rank: 1, totalUsers: 3, totalXp: 500 });
    expect(await repo.getUserGlobalRank('u1')).toEqual({ rank: 2, totalUsers: 3, totalXp: 350 });
    expect(await repo.getUserGlobalRank('u3')).toEqual({ rank: 3, totalUsers: 3, totalXp: 20 });
    expect(await repo.getUserGlobalRank('nobody')).toBeNull();
  });

  it('deletes an account once', async () => {
    const repo = new XpRepository(db.client);
    await repo.create({ userId: 'u1', guildId: 'g1' });
    await repo.create({ userId: 'u1', guildId: 'g2' });

    expect(await repo.delete({ userId: 'u1', guildId: 'g1' })).toBe(true);
    expect(await repo.delete({ userId: 'u1', guildId: 'g1' })).toBe(false);
    expect(await repo.getAccount('u1', 'g2')).not.toBeNull();
    expect(await repo.count()).toBe(1);
  });
});
