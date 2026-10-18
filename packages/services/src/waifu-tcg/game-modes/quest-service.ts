export type QuestType = 'DAILY' | 'WEEKLY';

export interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  type: QuestType;
  targetCount: number;
  rewardCredits: number;
  rewardDust: number;
  rewardTicket?: boolean;
}

export const CANONICAL_QUESTS: QuestDefinition[] = [
  {
    id: 'daily_pvp_win',
    title: 'Gladiator of the Day',
    description: 'Emerge victorious in 1 PvP card duel.',
    type: 'DAILY',
    targetCount: 1,
    rewardCredits: 200,
    rewardDust: 20,
  },
  {
    id: 'daily_expedition_complete',
    title: 'Intrepid Explorer',
    description: 'Deploy and complete 1 timed expedition.',
    type: 'DAILY',
    targetCount: 1,
    rewardCredits: 150,
    rewardDust: 15,
  },
  {
    id: 'daily_chat_drop_claim',
    title: 'Swift Catch',
    description: 'Claim 1 waifu card drop in server chat.',
    type: 'DAILY',
    targetCount: 1,
    rewardCredits: 100,
    rewardDust: 10,
  },
  {
    id: 'weekly_boss_raid_damage',
    title: 'Titan Slayer',
    description: 'Deal a cumulative 5,000 damage to World Boss Raids.',
    type: 'WEEKLY',
    targetCount: 5000,
    rewardCredits: 1000,
    rewardDust: 100,
    rewardTicket: true,
  },
];

export interface UserQuestProgress {
  questId: string;
  userId: string;
  currentCount: number;
  targetCount: number;
  isCompleted: boolean;
  isClaimed: boolean;
  quest: QuestDefinition;
}

export interface QuestClaimResult {
  success: boolean;
  questTitle?: string | undefined;
  rewardCredits?: number | undefined;
  rewardDust?: number | undefined;
  rewardTicket?: boolean | undefined;
  error?: string | undefined;
}

export class QuestService {
  // Key: `${userId}:${questId}`
  private readonly userProgress: Map<string, { currentCount: number; isClaimed: boolean }> =
    new Map();

  /**
   * Retrieves all available quests and current user progress.
   */
  public getUserQuests(userId: string): UserQuestProgress[] {
    return CANONICAL_QUESTS.map((quest) => {
      const key = `${userId}:${quest.id}`;
      const state = this.userProgress.get(key) ?? { currentCount: 0, isClaimed: false };
      const isCompleted = state.currentCount >= quest.targetCount;

      return {
        questId: quest.id,
        userId,
        currentCount: Math.min(quest.targetCount, state.currentCount),
        targetCount: quest.targetCount,
        isCompleted,
        isClaimed: state.isClaimed,
        quest,
      };
    });
  }

  /**
   * Records incremental progress toward a quest.
   */
  public recordProgress(userId: string, questId: string, amount = 1): void {
    const key = `${userId}:${questId}`;
    const prev = this.userProgress.get(key) ?? { currentCount: 0, isClaimed: false };
    this.userProgress.set(key, {
      currentCount: prev.currentCount + amount,
      isClaimed: prev.isClaimed,
    });
  }

  /**
   * Claims rewards for a completed quest.
   */
  public claimQuest(userId: string, questId: string): QuestClaimResult {
    const quest = CANONICAL_QUESTS.find((q) => q.id === questId);
    if (!quest) {
      return { success: false, error: 'Quest not found.' };
    }

    const key = `${userId}:${questId}`;
    const state = this.userProgress.get(key) ?? { currentCount: 0, isClaimed: false };

    if (state.currentCount < quest.targetCount) {
      return {
        success: false,
        error: `Quest **${quest.title}** is not completed yet! Progress: ${state.currentCount}/${quest.targetCount}.`,
      };
    }

    if (state.isClaimed) {
      return {
        success: false,
        error: `Quest **${quest.title}** rewards have already been claimed!`,
      };
    }

    state.isClaimed = true;
    this.userProgress.set(key, state);

    return {
      success: true,
      questTitle: quest.title,
      rewardCredits: quest.rewardCredits,
      rewardDust: quest.rewardDust,
      rewardTicket: quest.rewardTicket,
    };
  }
}
