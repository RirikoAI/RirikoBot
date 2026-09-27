import type { WaifuCardRepository, DatabaseClient } from '@ririko/database';
import type { CardRarity } from '../types.js';
import { RARITY_TIERS } from '../rarity/rarity-engine.js';
import { LevelingEngine } from './leveling-engine.js';

export interface CardExpResult {
  userCardId: string;
  cardName: string;
  expGained: number;
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
  isMaxLevel: boolean;
  expToNextLevel: number;
}

export interface DungeonExpOutcome {
  victory: boolean;
  isFirstClear: boolean;
  forfeited: boolean;
}

/** Share of a repeat-clear reward a card still earns from a real (non-forfeit) defeat. */
export const DEFEAT_EXP_SHARE = 0.2;

/**
 * Card EXP earned from one dungeon battle.
 * Win: 40 + 25/floor, doubled on first clear. Defeat: 20% of the repeat reward, so a player
 * stuck on a floor still grows. Forfeits earn nothing.
 */
export function getDungeonCardExp(floorNumber: number, outcome: DungeonExpOutcome): number {
  if (outcome.forfeited) return 0;
  const base = 40 + 25 * Math.max(1, floorNumber);
  if (!outcome.victory) return Math.round(base * DEFEAT_EXP_SHARE);
  return outcome.isFirstClear ? base * 2 : base;
}

/**
 * Applies EXP to owned cards, capping at the rarity's max level.
 */
export class CardProgressionService {
  constructor(
    private readonly cardRepo: WaifuCardRepository,
    private readonly leveling: LevelingEngine = new LevelingEngine(),
  ) {}

  async grantExp(
    userCardId: string,
    amount: number,
    tx?: DatabaseClient,
    expectedOwnerId?: string,
  ): Promise<CardExpResult | null> {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid card XP amount');
    if (amount <= 0) return null;
    return this.cardRepo.withUserCardLock(
      userCardId,
      async (userCard, lockedTx) => {
        if (!userCard) return null;
        if (
          expectedOwnerId &&
          (userCard.userId !== expectedOwnerId || !['IDLE', 'EQUIPPED'].includes(userCard.state))
        )
          return null;
        const base = await this.cardRepo.findById(userCard.cardId, lockedTx);
        if (expectedOwnerId && !base) return null;
        const maxLevel = RARITY_TIERS[(base?.rarity ?? 'COMMON') as CardRarity]?.maxLevel ?? 20;
        let remaining = -userCard.exp;
        for (let level = userCard.level; level < maxLevel; level++)
          remaining += this.leveling.getExpForNextLevel(level);
        const expGained = Math.min(amount, Math.max(0, remaining));
        const result = this.leveling.addExp(userCard.level, userCard.exp, expGained, maxLevel);
        if (expGained > 0) {
          await this.cardRepo.updateUserCardLevelAndExp(
            userCardId,
            result.newLevel,
            result.newExp,
            lockedTx,
          );
        }

        return {
          userCardId,
          cardName: base?.name ?? 'Card',
          expGained,
          previousLevel: userCard.level,
          newLevel: result.newLevel,
          levelsGained: result.levelsGained,
          isMaxLevel: result.isMaxLevel,
          expToNextLevel: result.expToNextLevel,
        };
      },
      tx,
    );
  }
}

/** One-line summary for battle result screens. */
export function formatCardExpResult(result: CardExpResult): string {
  if (result.expGained === 0) return `🎴 **${result.cardName}** is at max level.`;
  const levelUp =
    result.levelsGained > 0
      ? ` 🆙 **Level Up! Lv.${result.previousLevel} → Lv.${result.newLevel}**`
      : ` (Lv.${result.newLevel}, ${result.expToNextLevel} EXP to next)`;
  return `🎴 **${result.cardName}** +${result.expGained} Card EXP${levelUp}`;
}
