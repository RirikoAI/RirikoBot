import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { WaifuGuildRepository } from './waifu-guild.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';

describeDialects('WaifuGuildRepository', (db) => {
  it('creates a guild with defaults and finds it by id and name', async () => {
    const repo = new WaifuGuildRepository(db.client);
    const created = await repo.create({ name: 'Starlight', leaderUserId: 'leader' });

    expect(created.level).toBe(1);
    expect(created.guildXp).toBe(0);
    expect(created.guildBank).toBe(0);
    expect(created.createdAt).toBeInstanceOf(Date);

    expect((await repo.findById(created.id))?.name).toBe('Starlight');
    expect((await repo.findByName('Starlight'))?.id).toBe(created.id);
    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.findByName('Nobody')).toBeNull();
    expect(await repo.count()).toBe(1);
  });

  it('creates a guild with explicit level, xp and bank', async () => {
    const repo = new WaifuGuildRepository(db.client);
    const created = await repo.create({
      name: 'Veterans',
      leaderUserId: 'leader',
      level: 7,
      guildXp: 1200,
      guildBank: 50_000,
    });

    expect(created.level).toBe(7);
    expect(created.guildXp).toBe(1200);
    expect(created.guildBank).toBe(50_000);
  });

  it('rejects a duplicate guild name', async () => {
    const repo = new WaifuGuildRepository(db.client);
    await repo.create({ name: 'Starlight', leaderUserId: 'a' });

    await expect(repo.create({ name: 'Starlight', leaderUserId: 'b' })).rejects.toThrow();
    expect(await repo.count()).toBe(1);
  });

  it('updates guild fields and throws for a missing guild', async () => {
    const repo = new WaifuGuildRepository(db.client);
    const created = await repo.create({ name: 'Starlight', leaderUserId: 'a' });

    const updated = await repo.update(created.id, {
      name: 'Moonlight',
      leaderUserId: 'b',
      level: 3,
      guildXp: 90,
      guildBank: 400,
    });
    expect(updated.name).toBe('Moonlight');
    expect(updated.leaderUserId).toBe('b');
    expect(updated.level).toBe(3);
    expect(updated.guildXp).toBe(90);
    expect(updated.guildBank).toBe(400);

    await expect(repo.update(MISSING_UUID, { level: 2 })).rejects.toThrow(DatabaseError);
  });

  it('adds guild xp and bank deltas, including negative ones', async () => {
    const repo = new WaifuGuildRepository(db.client);
    const created = await repo.create({ name: 'Starlight', leaderUserId: 'a', guildBank: 100 });

    expect((await repo.addGuildXp(created.id, 40)).guildXp).toBe(40);
    expect((await repo.addGuildXp(created.id, 60)).guildXp).toBe(100);
    expect((await repo.modifyGuildBank(created.id, 250)).guildBank).toBe(350);
    expect((await repo.modifyGuildBank(created.id, -50)).guildBank).toBe(300);

    await expect(repo.addGuildXp(MISSING_UUID, 1)).rejects.toThrow(DatabaseError);
    await expect(repo.modifyGuildBank(MISSING_UUID, 1)).rejects.toThrow(DatabaseError);
  });

  it('ranks guilds by level, then xp, with paging', async () => {
    const repo = new WaifuGuildRepository(db.client);
    await repo.create({ name: 'Low', leaderUserId: 'a', level: 1, guildXp: 900 });
    await repo.create({ name: 'MidLowXp', leaderUserId: 'b', level: 5, guildXp: 10 });
    await repo.create({ name: 'MidHighXp', leaderUserId: 'c', level: 5, guildXp: 80 });
    await repo.create({ name: 'Top', leaderUserId: 'd', level: 9, guildXp: 0 });

    expect((await repo.listGuildsByRank()).map((g) => g.name)).toEqual([
      'Top',
      'MidHighXp',
      'MidLowXp',
      'Low',
    ]);
    expect((await repo.listGuildsByRank(2)).map((g) => g.name)).toEqual(['Top', 'MidHighXp']);
    expect((await repo.listGuildsByRank(2, 2)).map((g) => g.name)).toEqual(['MidLowXp', 'Low']);
  });

  it('adds members with a default rank and finds them', async () => {
    const repo = new WaifuGuildRepository(db.client);
    const guild = await repo.create({ name: 'Starlight', leaderUserId: 'leader' });

    const leader = await repo.addMember({ guildId: guild.id, userId: 'leader', rank: 'LEADER' });
    const member = await repo.addMember({ guildId: guild.id, userId: 'm1' });
    expect(leader.rank).toBe('LEADER');
    expect(member.rank).toBe('MEMBER');
    expect(member.contributionXp).toBe(0);
    expect(member.joinedAt).toBeInstanceOf(Date);

    expect((await repo.findMember(guild.id, 'm1'))?.rank).toBe('MEMBER');
    expect(await repo.findMember(guild.id, 'stranger')).toBeNull();
    expect(await repo.countMembers(guild.id)).toBe(2);
    expect(await repo.countMembers(MISSING_UUID)).toBe(0);

    await expect(repo.addMember({ guildId: guild.id, userId: 'm1' })).rejects.toThrow();
  });

  it('finds the guild a user belongs to, or null', async () => {
    const repo = new WaifuGuildRepository(db.client);
    const guild = await repo.create({ name: 'Starlight', leaderUserId: 'leader' });
    await repo.addMember({ guildId: guild.id, userId: 'm1', rank: 'OFFICER' });

    const found = await repo.findUserGuild('m1');
    expect(found?.guild.id).toBe(guild.id);
    expect(found?.member.rank).toBe('OFFICER');
    expect(await repo.findUserGuild('stranger')).toBeNull();
  });

  it('returns null for a member whose guild no longer exists', async () => {
    const repo = new WaifuGuildRepository(db.client);
    await repo.addMember({ guildId: MISSING_UUID, userId: 'orphan' });

    expect(await repo.findUserGuild('orphan')).toBeNull();
  });

  it('lists members by contribution with paging', async () => {
    const repo = new WaifuGuildRepository(db.client);
    const guild = await repo.create({ name: 'Starlight', leaderUserId: 'leader' });
    for (const user of ['a', 'b', 'c']) await repo.addMember({ guildId: guild.id, userId: user });
    await repo.addContributionXp(guild.id, 'a', 10);
    await repo.addContributionXp(guild.id, 'b', 30);
    await repo.addContributionXp(guild.id, 'c', 20);

    expect((await repo.listMembers(guild.id)).map((m) => m.userId)).toEqual(['b', 'c', 'a']);
    expect((await repo.listMembers(guild.id, 1)).map((m) => m.userId)).toEqual(['b']);
    expect((await repo.listMembers(guild.id, 5, 1)).map((m) => m.userId)).toEqual(['c', 'a']);
    expect(await repo.listMembers(MISSING_UUID)).toEqual([]);
  });

  it('changes ranks and contribution, throwing for a missing member', async () => {
    const repo = new WaifuGuildRepository(db.client);
    const guild = await repo.create({ name: 'Starlight', leaderUserId: 'leader' });
    await repo.addMember({ guildId: guild.id, userId: 'm1' });

    expect((await repo.updateMemberRank(guild.id, 'm1', 'OFFICER')).rank).toBe('OFFICER');
    expect((await repo.addContributionXp(guild.id, 'm1', 25)).contributionXp).toBe(25);
    expect((await repo.addContributionXp(guild.id, 'm1', 5)).contributionXp).toBe(30);

    await expect(repo.updateMemberRank(guild.id, 'ghost', 'OFFICER')).rejects.toThrow(
      /member not found/,
    );
    await expect(repo.addContributionXp(guild.id, 'ghost', 5)).rejects.toThrow(/member not found/);
  });

  it('removes a member once', async () => {
    const repo = new WaifuGuildRepository(db.client);
    const guild = await repo.create({ name: 'Starlight', leaderUserId: 'leader' });
    await repo.addMember({ guildId: guild.id, userId: 'm1' });

    expect(await repo.removeMember(guild.id, 'm1')).toBe(true);
    expect(await repo.removeMember(guild.id, 'm1')).toBe(false);
    expect(await repo.countMembers(guild.id)).toBe(0);
  });

  it('deletes a guild together with its members', async () => {
    const repo = new WaifuGuildRepository(db.client);
    const guild = await repo.create({ name: 'Starlight', leaderUserId: 'leader' });
    const other = await repo.create({ name: 'Other', leaderUserId: 'x' });
    await repo.addMember({ guildId: guild.id, userId: 'm1' });
    await repo.addMember({ guildId: other.id, userId: 'm2' });

    expect(await repo.delete(guild.id)).toBe(true);
    expect(await repo.delete(guild.id)).toBe(false);
    expect(await repo.findById(guild.id)).toBeNull();
    expect(await repo.findUserGuild('m1')).toBeNull();
    expect(await repo.countMembers(other.id)).toBe(1);
  });
});
