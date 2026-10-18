import { describe, it, expect } from 'vitest';
import type {
  AchievementRepository,
  DatabaseClient,
  EconomyRepository,
  GameAchievement,
  UserAchievement,
  WaifuCardRepository,
} from '@ririko/database';
import { AchievementService } from '../achievements/achievement-service.js';
import { CANONICAL_ACHIEVEMENTS } from '../achievements/seeds.js';

/** In-memory achievement repository covering the calls that progress syncing makes. */
function createFakeRepo() {
  const achievements = CANONICAL_ACHIEVEMENTS.map(
    (a, i) => ({ ...a, id: `ach-${i}` }) as unknown as GameAchievement,
  );
  const rows = new Map<string, UserAchievement>();
  const repo = {
    listAchievements: async () => achievements,
    findById: async (id: string) => achievements.find((a) => a.id === id) ?? null,
    findByCode: async (code: string) => achievements.find((a) => a.code === code) ?? null,
    getUserAchievement: async (userId: string, achievementId: string) =>
      rows.get(`${userId}:${achievementId}`) ?? null,
    getOrCreateUserAchievement: async (userId: string, achievementId: string) => {
      const key = `${userId}:${achievementId}`;
      let row = rows.get(key);
      if (!row) {
        row = {
          id: key,
          userId,
          achievementId,
          progress: 0,
          isUnlocked: false,
          isClaimed: false,
          unlockedAt: null,
          claimedAt: null,
        } as UserAchievement;
        rows.set(key, row);
      }
      return row;
    },
    updateProgress: async (
      userId: string,
      achievementId: string,
      progress: number,
      isUnlocked: boolean,
    ) => {
      const key = `${userId}:${achievementId}`;
      const row = {
        ...rows.get(key)!,
        progress,
        isUnlocked: isUnlocked || rows.get(key)!.isUnlocked,
      };
      rows.set(key, row);
      return row;
    },
    listUserAchievements: async (userId: string, options?: { isUnlocked?: boolean }) =>
      [...rows.values()]
        .filter((r) => r.userId === userId)
        .filter((r) => options?.isUnlocked === undefined || r.isUnlocked === options.isUnlocked)
        .map((r) => ({ ...r, achievement: achievements.find((a) => a.id === r.achievementId)! })),
  };
  const progressOf = (userId: string, type: string): number => {
    const ach = achievements.find((a) => a.requirementType === type)!;
    return rows.get(`${userId}:${ach.id}`)?.progress ?? 0;
  };
  const unlockedOf = (userId: string, type: string): boolean => {
    const ach = achievements.find((a) => a.requirementType === type)!;
    return rows.get(`${userId}:${ach.id}`)?.isUnlocked ?? false;
  };
  return { repo: repo as unknown as AchievementRepository, progressOf, unlockedOf };
}

function createService(
  stats: { uniqueCards: number; elements: number; mythicCards: number },
  withCards = true,
) {
  const fake = createFakeRepo();
  const cardRepo = { getCollectionStats: async () => stats } as unknown as WaifuCardRepository;
  const service = new AchievementService(
    fake.repo,
    {} as EconomyRepository,
    {} as DatabaseClient,
    withCards ? { waifuCardRepo: cardRepo } : {},
  );
  return { service, stats, ...fake };
}

describe('AchievementService.syncCollection (BUG-0025)', () => {
  it('records unique cards, elements and mythic cards as absolute progress', async () => {
    const { service, progressOf, unlockedOf } = createService({
      uniqueCards: 10,
      elements: 3,
      mythicCards: 1,
    });

    await service.syncCollection('u1');

    expect(progressOf('u1', 'CARD_COUNT')).toBe(10);
    expect(unlockedOf('u1', 'CARD_COUNT')).toBe(true);
    expect(progressOf('u1', 'ELEMENTAL_COUNT')).toBe(3);
    expect(unlockedOf('u1', 'ELEMENTAL_COUNT')).toBe(false);
    expect(progressOf('u1', 'MYTHIC_CARD_COUNT')).toBe(1);
    expect(unlockedOf('u1', 'MYTHIC_CARD_COUNT')).toBe(true);
  });

  it('never lowers progress when the collection shrinks', async () => {
    const { service, stats, progressOf } = createService({
      uniqueCards: 6,
      elements: 5,
      mythicCards: 0,
    });
    await service.syncCollection('u1');

    stats.uniqueCards = 2;
    stats.elements = 1;
    await service.syncCollection('u1');

    expect(progressOf('u1', 'CARD_COUNT')).toBe(6);
    expect(progressOf('u1', 'ELEMENTAL_COUNT')).toBe(5);
  });

  it('does nothing without a card repository', async () => {
    const { service, progressOf } = createService(
      { uniqueCards: 10, elements: 7, mythicCards: 1 },
      false,
    );

    await service.syncCollection('u1');

    expect(progressOf('u1', 'CARD_COUNT')).toBe(0);
  });

  it('catches up existing players when achievements are listed', async () => {
    const { service, progressOf } = createService({ uniqueCards: 4, elements: 2, mythicCards: 0 });

    const list = await service.getUserAchievements('u1');

    expect(progressOf('u1', 'CARD_COUNT')).toBe(4);
    expect(list.find((a) => a.achievement.requirementType === 'CARD_COUNT')?.progress).toBe(4);
  });

  it('syncs the collection once for the whole claim-all', async () => {
    const { service } = createService({ uniqueCards: 1, elements: 1, mythicCards: 0 });
    let calls = 0;
    const original = service.syncCollection.bind(service);
    service.syncCollection = async (userId: string) => {
      calls += 1;
      await original(userId);
    };

    const claimed = await service.claimAll('u1');

    expect(claimed).toEqual([]);
    expect(calls).toBe(1);
  });

  it('syncs before checking that a claim is unlocked', async () => {
    const { service, progressOf } = createService({ uniqueCards: 1, elements: 1, mythicCards: 0 });

    await expect(service.claimAchievement('u1', 'COLL_INITIATE')).rejects.toThrow(
      /has not been unlocked/,
    );
    expect(progressOf('u1', 'CARD_COUNT')).toBe(1);
  });
});
