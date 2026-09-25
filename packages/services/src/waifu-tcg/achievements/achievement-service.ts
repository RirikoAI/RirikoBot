import type {
  AchievementRepository,
  EconomyRepository,
  XpRepository,
  UserInventoryItemRepository,
  GameItemRepository,
  WaifuCardRepository,
  DatabaseClient,
  GameAchievement,
  UserAchievement,
} from '@ririko/database';
import { withTransaction } from '@ririko/database';
import { CANONICAL_ACHIEVEMENTS } from './seeds.js';
import { ItemGrantService } from '../equipment/item-grant.service.js';

export interface AchievementClaimResult {
  achievement: GameAchievement;
  rewardsDispatched: {
    exp: number;
    credits: number;
    cards: string[];
    items: string[];
    consumables: Record<string, number>;
    title: string | null;
    badge: string | null;
  };
  summary: string;
}

export interface ProgressUpdateResult {
  achievement: GameAchievement;
  userAchievement: UserAchievement;
  justUnlocked: boolean;
}

export class AchievementService {
  private readonly xpRepo: XpRepository | undefined;
  private readonly grants: ItemGrantService | undefined;
  private readonly waifuCardRepo: WaifuCardRepository | undefined;

  constructor(
    private readonly achievementRepo: AchievementRepository,
    private readonly economyRepo: EconomyRepository,
    private readonly dbClient: DatabaseClient,
    options: {
      xpRepo?: XpRepository | undefined;
      inventoryRepo?: UserInventoryItemRepository | undefined;
      itemRepo?: GameItemRepository | undefined;
      waifuCardRepo?: WaifuCardRepository | undefined;
    } = {},
  ) {
    this.xpRepo = options.xpRepo;
    this.grants =
      options.itemRepo && options.inventoryRepo
        ? new ItemGrantService(options.itemRepo, options.inventoryRepo)
        : undefined;
    this.waifuCardRepo = options.waifuCardRepo;
  }

  /**
   * Seeds canonical achievements into the database if not already present.
   */
  async seedAchievements(): Promise<void> {
    await this.achievementRepo.bulkCreateAchievements(CANONICAL_ACHIEVEMENTS);
  }

  /**
   * Records progress towards achievements of a specific requirement type.
   */
  async recordProgress(
    userId: string,
    requirementType: string,
    progressOrDelta: number,
    isAbsolute = false,
  ): Promise<ProgressUpdateResult[]> {
    const achievements = await this.achievementRepo.listAchievements();
    const matching = achievements.filter((a) => a.requirementType === requirementType);
    if (matching.length === 0) return [];

    const results: ProgressUpdateResult[] = [];

    for (const ach of matching) {
      const current = await this.achievementRepo.getOrCreateUserAchievement(userId, ach.id);
      if (current.isUnlocked) {
        continue;
      }

      const newProgress = isAbsolute
        ? Math.max(current.progress, progressOrDelta)
        : current.progress + progressOrDelta;

      const isNowUnlocked = newProgress >= ach.requirementTarget;

      const updated = await this.achievementRepo.updateProgress(
        userId,
        ach.id,
        newProgress,
        isNowUnlocked,
      );

      results.push({
        achievement: ach,
        userAchievement: updated,
        justUnlocked: isNowUnlocked,
      });
    }

    return results;
  }

  /**
   * Claims rewards for an unlocked achievement atomically.
   */
  async claimAchievement(userId: string, codeOrId: string): Promise<AchievementClaimResult> {
    const achievement =
      (await this.achievementRepo.findById(codeOrId)) ??
      (await this.achievementRepo.findByCode(codeOrId));

    if (!achievement) {
      throw new Error(`Achievement "${codeOrId}" not found.`);
    }

    const userAch = await this.achievementRepo.getUserAchievement(userId, achievement.id);
    if (!userAch || !userAch.isUnlocked) {
      throw new Error(`Achievement "${achievement.title}" has not been unlocked yet.`);
    }

    if (userAch.isClaimed) {
      throw new Error(`Rewards for "${achievement.title}" have already been claimed.`);
    }

    return withTransaction(this.dbClient, async (tx) => {
      // 1. Mark claimed
      await this.achievementRepo.claimReward(userAch.id, tx);

      const dispatched = {
        exp: achievement.rewardXp,
        credits: achievement.rewardCredits,
        cards: [] as string[],
        items: [] as string[],
        consumables: {} as Record<string, number>,
        title: achievement.rewardTitle,
        badge: achievement.badgeIcon,
      };

      // 2. Dispatch Credits
      if (achievement.rewardCredits > 0) {
        await this.economyRepo.modifyBalance(
          {
            userId,
            walletDelta: achievement.rewardCredits,
            type: 'ACHIEVEMENT_REWARD',
            source: `ACHIEVEMENT_${achievement.code}`,
          },
          tx,
        );
      }

      // 3. Dispatch Account EXP
      if (achievement.rewardXp > 0 && this.xpRepo) {
        await this.xpRepo.addXp(
          {
            userId,
            guildId: 'global',
            xpDelta: achievement.rewardXp,
            source: 'ACHIEVEMENT_REWARD',
          },
          tx,
        );
      }

      // 4. Dispatch Collectible Card
      if (achievement.rewardCardId && this.waifuCardRepo) {
        const card = await this.waifuCardRepo.findById(achievement.rewardCardId, tx);
        if (card) {
          await this.waifuCardRepo.createUserCard(
            {
              userId,
              cardId: card.id,
              serialNumber: 1,
              level: 1,
              exp: 0,
              state: 'IDLE',
            },
            tx,
          );
          dispatched.cards.push(card.name);
        }
      }

      // 5. Dispatch Equipment / Accessory Item (catalog code or legacy alias)
      if (achievement.rewardItemId && this.grants) {
        const granted = await this.grants.grant(
          userId,
          achievement.rewardItemId,
          1,
          'ACHIEVEMENT',
          tx,
        );
        if (granted) dispatched.items.push(granted.item.name);
      }

      // 6. Dispatch Consumables (keyed by catalog code or legacy alias; non-item keys are skipped)
      if (achievement.rewardConsumables && this.grants) {
        const consumables = achievement.rewardConsumables as Record<string, number>;
        for (const [key, qty] of Object.entries(consumables)) {
          if (qty <= 0) continue;
          const granted = await this.grants.grant(userId, key, qty, 'ACHIEVEMENT', tx);
          if (granted) dispatched.consumables[granted.item.name] = qty;
        }
      }

      // Format summary
      const rewardParts: string[] = [];
      if (dispatched.credits > 0)
        rewardParts.push(`🪙 +${dispatched.credits.toLocaleString()} Credits`);
      if (dispatched.exp > 0) rewardParts.push(`⚡ +${dispatched.exp.toLocaleString()} EXP`);
      if (dispatched.title) rewardParts.push(`🏷️ Title: "${dispatched.title}"`);
      if (dispatched.badge) rewardParts.push(`🎖️ Badge: ${dispatched.badge}`);
      for (const card of dispatched.cards) rewardParts.push(`🎴 Card: ${card}`);
      for (const item of dispatched.items) rewardParts.push(`🗡️ Item: ${item}`);
      for (const [item, qty] of Object.entries(dispatched.consumables)) {
        rewardParts.push(`🧪 ${qty}x ${item}`);
      }

      const summary = `🏆 **Achievement Claimed: ${achievement.title}**\n${rewardParts.join(' | ')}`;

      return {
        achievement,
        rewardsDispatched: dispatched,
        summary,
      };
    });
  }

  /**
   * Claims all currently unlocked and unclaimed achievements for a user.
   */
  async claimAll(userId: string): Promise<AchievementClaimResult[]> {
    const userAchievements = await this.achievementRepo.listUserAchievements(userId, {
      isUnlocked: true,
      isClaimed: false,
    });

    const results: AchievementClaimResult[] = [];
    for (const uAch of userAchievements) {
      const res = await this.claimAchievement(userId, uAch.achievement.id);
      results.push(res);
    }
    return results;
  }

  /**
   * Retrieves all achievements with the user's progress and unlock status.
   */
  async getUserAchievements(
    userId: string,
  ): Promise<(UserAchievement & { achievement: GameAchievement })[]> {
    const all = await this.achievementRepo.listAchievements();
    const userMap = new Map<string, UserAchievement>();

    const userList = await this.achievementRepo.listUserAchievements(userId);
    for (const u of userList) {
      userMap.set(u.achievementId, u);
    }

    const results: (UserAchievement & { achievement: GameAchievement })[] = [];
    for (const ach of all) {
      const existing = userMap.get(ach.id);
      if (existing) {
        results.push({
          ...existing,
          achievement: ach,
        });
      } else {
        results.push({
          id: '',
          userId,
          achievementId: ach.id,
          progress: 0,
          isUnlocked: false,
          isClaimed: false,
          unlockedAt: null,
          claimedAt: null,
          achievement: ach,
        });
      }
    }

    return results;
  }

  /**
   * Lists all game achievements.
   */
  async listAllAchievements(): Promise<GameAchievement[]> {
    return this.achievementRepo.listAchievements();
  }
}
