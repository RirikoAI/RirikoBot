import { expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { AchievementRepository } from './achievement.repository.js';
import { XpRepository } from './xp.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';

const achievement = (code: string, overrides: Record<string, unknown> = {}) => ({
  code,
  title: `Title ${code}`,
  description: `Description ${code}`,
  category: 'COLLECTION',
  requirementType: 'OWN_CARDS',
  ...overrides,
});

describeDialects('AchievementRepository', (db) => {
  it('creates an achievement with defaults and finds it by id and code', async () => {
    const repo = new AchievementRepository(db.client);
    const created = await repo.create(achievement('FIRST_CARD'));

    expect(created.tier).toBe('BRONZE');
    expect(created.requirementTarget).toBe(1);
    expect(created.rewardXp).toBe(0);
    expect(created.rewardCredits).toBe(0);
    expect(created.rewardCardId).toBeNull();
    expect(created.rewardItemId).toBeNull();
    expect(created.rewardConsumables).toEqual({});
    expect(created.rewardTitle).toBeNull();
    expect(created.badgeIcon).toBeNull();
    expect(created.isHidden).toBe(false);
    expect(created.createdAt).toBeInstanceOf(Date);

    expect((await repo.findById(created.id))?.code).toBe('FIRST_CARD');
    expect((await repo.findByCode('FIRST_CARD'))?.id).toBe(created.id);
    expect(await repo.exists(created.id)).toBe(true);
    expect(await repo.exists(MISSING_UUID)).toBe(false);
    expect(await repo.findById(MISSING_UUID)).toBeNull();
    expect(await repo.findByCode('NOPE')).toBeNull();
    expect(await repo.count()).toBe(1);
  });

  it('keeps explicit reward values', async () => {
    const repo = new AchievementRepository(db.client);
    const created = await repo.create(
      achievement('BIG', {
        tier: 'GOLD',
        requirementTarget: 50,
        rewardXp: 500,
        rewardCredits: 25_000,
        rewardConsumables: { potion: 3 },
        rewardTitle: 'Collector',
        badgeIcon: 'trophy',
        isHidden: true,
      }),
    );

    expect(created.tier).toBe('GOLD');
    expect(created.requirementTarget).toBe(50);
    expect(created.rewardXp).toBe(500);
    expect(Number(created.rewardCredits)).toBe(25_000);
    expect(created.rewardConsumables).toEqual({ potion: 3 });
    expect(created.rewardTitle).toBe('Collector');
    expect(created.badgeIcon).toBe('trophy');
    expect(created.isHidden).toBe(true);
  });

  it('updates only the given fields and throws for a missing achievement', async () => {
    const repo = new AchievementRepository(db.client);
    const created = await repo.create(achievement('A', { rewardXp: 10 }));

    const updated = await repo.update(created.id, {
      title: 'New title',
      description: 'New description',
      category: 'BATTLE',
      tier: 'SILVER',
      requirementType: 'WIN_BATTLES',
      requirementTarget: 9,
      rewardXp: 20,
      rewardCredits: 300,
      rewardConsumables: { elixir: 1 },
      rewardTitle: 'Champion',
      badgeIcon: 'sword',
      isHidden: true,
    });
    expect(updated.title).toBe('New title');
    expect(updated.description).toBe('New description');
    expect(updated.category).toBe('BATTLE');
    expect(updated.tier).toBe('SILVER');
    expect(updated.requirementType).toBe('WIN_BATTLES');
    expect(updated.requirementTarget).toBe(9);
    expect(updated.rewardXp).toBe(20);
    expect(Number(updated.rewardCredits)).toBe(300);
    expect(updated.rewardConsumables).toEqual({ elixir: 1 });
    expect(updated.rewardTitle).toBe('Champion');
    expect(updated.badgeIcon).toBe('sword');
    expect(updated.isHidden).toBe(true);
    expect(updated.code).toBe('A');

    const cleared = await repo.update(created.id, { rewardTitle: null, rewardCardId: null });
    expect(cleared.rewardTitle).toBeNull();
    expect(cleared.title).toBe('New title');

    await expect(repo.update(MISSING_UUID, { title: 'x' })).rejects.toThrow(DatabaseError);
  });

  it('points rewards at a card and an item', async () => {
    const repo = new AchievementRepository(db.client);
    const created = await repo.create(achievement('A'));
    const cardId = '00000000-0000-4000-8000-0000000000c1';
    const itemId = '00000000-0000-4000-8000-0000000000e1';

    const updated = await repo.update(created.id, { rewardCardId: cardId, rewardItemId: itemId });
    expect(updated.rewardCardId).toBe(cardId);
    expect(updated.rewardItemId).toBe(itemId);
  });

  it('deletes an achievement once', async () => {
    const repo = new AchievementRepository(db.client);
    const created = await repo.create(achievement('A'));

    expect(await repo.delete(created.id)).toBe(true);
    expect(await repo.delete(created.id)).toBe(false);
    expect(await repo.count()).toBe(0);
  });

  it('lists achievements filtered by category and tier', async () => {
    const repo = new AchievementRepository(db.client);
    await repo.create(achievement('A', { category: 'BATTLE', tier: 'GOLD' }));
    await repo.create(achievement('B', { category: 'BATTLE', tier: 'BRONZE' }));
    await repo.create(achievement('C', { category: 'COLLECTION', tier: 'GOLD' }));

    const codes = async (options?: { category?: string; tier?: string }) =>
      (await repo.listAchievements(options)).map((a) => a.code).sort();
    expect(await codes()).toEqual(['A', 'B', 'C']);
    expect(await codes({ category: 'BATTLE' })).toEqual(['A', 'B']);
    expect(await codes({ tier: 'GOLD' })).toEqual(['A', 'C']);
    expect(await codes({ category: 'BATTLE', tier: 'GOLD' })).toEqual(['A']);
    expect(await codes({ category: 'NONE' })).toEqual([]);
  });

  it('bulk creates only the achievements whose code is missing', async () => {
    const repo = new AchievementRepository(db.client);
    await repo.create(achievement('A', { title: 'Hand edited' }));

    await repo.bulkCreateAchievements([
      achievement('A', { title: 'Seeded' }),
      achievement('B'),
      achievement('C'),
    ]);

    expect(await repo.count()).toBe(3);
    expect((await repo.findByCode('A'))?.title).toBe('Hand edited');
    await repo.bulkCreateAchievements([achievement('B'), achievement('C')]);
    expect(await repo.count()).toBe(3);
  });

  it('tracks user progress, unlocking once, and a claim', async () => {
    const repo = new AchievementRepository(db.client);
    const ach = await repo.create(achievement('A', { requirementTarget: 3 }));

    expect(await repo.getUserAchievement('u1', ach.id)).toBeNull();
    const fresh = await repo.getOrCreateUserAchievement('u1', ach.id);
    expect(fresh.progress).toBe(0);
    expect(fresh.isUnlocked).toBe(false);
    expect(fresh.isClaimed).toBe(false);
    expect(fresh.unlockedAt).toBeNull();
    expect(fresh.claimedAt).toBeNull();
    expect((await repo.getOrCreateUserAchievement('u1', ach.id)).id).toBe(fresh.id);

    const partial = await repo.updateProgress('u1', ach.id, 2);
    expect(partial.progress).toBe(2);
    expect(partial.isUnlocked).toBe(false);

    const unlocked = await repo.updateProgress('u1', ach.id, 3, true);
    expect(unlocked.isUnlocked).toBe(true);
    const unlockedAt = unlocked.unlockedAt;
    expect(unlockedAt).toBeInstanceOf(Date);

    const again = await repo.updateProgress('u1', ach.id, 4, true);
    expect(again.progress).toBe(4);
    expect(again.unlockedAt?.getTime()).toBe(unlockedAt?.getTime());

    const claimed = await repo.claimReward(fresh.id);
    expect(claimed.isClaimed).toBe(true);
    expect(claimed.claimedAt).toBeInstanceOf(Date);
    expect((await repo.getUserAchievement('u1', ach.id))?.isClaimed).toBe(true);

    await expect(repo.claimReward(MISSING_UUID)).rejects.toThrow(DatabaseError);
  });

  it('lists a user achievements with their definitions and filters', async () => {
    const repo = new AchievementRepository(db.client);
    const a = await repo.create(achievement('A'));
    const b = await repo.create(achievement('B'));
    const c = await repo.create(achievement('C'));
    await repo.updateProgress('u1', a.id, 1, true);
    const claimable = await repo.updateProgress('u1', b.id, 1, true);
    await repo.claimReward(claimable.id);
    await repo.updateProgress('u1', c.id, 0);
    await repo.updateProgress('u2', a.id, 1, true);

    const codes = async (options?: { isClaimed?: boolean; isUnlocked?: boolean }) =>
      (await repo.listUserAchievements('u1', options)).map((r) => r.achievement.code).sort();
    expect(await codes()).toEqual(['A', 'B', 'C']);
    expect(await codes({ isClaimed: true })).toEqual(['B']);
    expect(await codes({ isClaimed: false })).toEqual(['A', 'C']);
    expect(await codes({ isUnlocked: true })).toEqual(['A', 'B']);
    expect(await codes({ isUnlocked: false, isClaimed: false })).toEqual(['C']);
    expect(await repo.listUserAchievements('nobody')).toEqual([]);
  });

  it('skips user rows whose achievement was deleted', async () => {
    const repo = new AchievementRepository(db.client);
    const a = await repo.create(achievement('A'));
    const b = await repo.create(achievement('B'));
    await repo.updateProgress('u1', a.id, 1);
    await repo.updateProgress('u1', b.id, 1);
    await repo.delete(a.id);

    expect((await repo.listUserAchievements('u1')).map((r) => r.achievement.code)).toEqual(['B']);
  });

  it('counts unlocked and claimed completions among the guild members only', async () => {
    const repo = new AchievementRepository(db.client);
    const xp = new XpRepository(db.client);
    const a = await repo.create(achievement('A'));
    const b = await repo.create(achievement('B'));
    for (const user of ['u1', 'u2', 'u3']) await xp.getOrCreateAccount(user, 'g1');
    await xp.getOrCreateAccount('u4', 'g2');

    await repo.updateProgress('u1', a.id, 1, true);
    const u2a = await repo.updateProgress('u2', a.id, 1, true);
    await repo.claimReward(u2a.id);
    await repo.updateProgress('u3', a.id, 0);
    await repo.updateProgress('u1', b.id, 1, true);
    await repo.updateProgress('u4', a.id, 1, true);

    const result = await repo.guildCompletionCounts('g1');
    expect(result.members).toBe(3);
    expect(result.counts.get(a.id)).toEqual({ unlocked: 2, claimed: 1 });
    expect(result.counts.get(b.id)).toEqual({ unlocked: 1, claimed: 0 });

    const empty = await repo.guildCompletionCounts('nowhere');
    expect(empty.members).toBe(0);
    expect(empty.counts.size).toBe(0);
  });
});
