import type { EconomyRepository } from '@ririko/database';
import type { EventBus, CoreEvents } from '@ririko/core';
import {
  EconomyEventType,
  type EconomyEvent,
  type RewardRule,
  type RewardResult,
  type MessageActivityMetadata,
} from './types.js';
import { AntiSpamEvaluator } from './anti-spam.js';

export interface EconomyServiceOptions {
  repository: EconomyRepository;
  eventBus?: EventBus<CoreEvents> | undefined;
  antiSpam?: AntiSpamEvaluator | undefined;
  customRules?: Partial<Record<EconomyEventType, RewardRule>> | undefined;
}

/**
 * Default base reward values matching Section 32 & 33 of BLUEPRINT.md.
 */
export const DEFAULT_REWARD_RULES: Record<EconomyEventType, RewardRule> = {
  [EconomyEventType.MESSAGE_SENT]: { credits: 20, xp: 20, cooldownSeconds: 60 },
  [EconomyEventType.VOICE_MINUTE]: { credits: 35, xp: 40, cooldownSeconds: 60 },
  [EconomyEventType.ATTACHMENT_UPLOADED]: { credits: 25, xp: 30, cooldownSeconds: 60 },
  [EconomyEventType.GAME_WON]: { credits: 50, xp: 50 },
  [EconomyEventType.GAME_LOST]: { credits: 0, xp: 10 },
  [EconomyEventType.QUEST_COMPLETE]: { credits: 100, xp: 150 },
  [EconomyEventType.CARD_DROPPED]: { credits: 10, xp: 15 },
  [EconomyEventType.CARD_CLAIMED]: { credits: 15, xp: 20 },
  [EconomyEventType.CARD_SOLD]: { credits: 0, xp: 25 },
  [EconomyEventType.DAILY_REWARD]: { credits: 250, xp: 50 },
  [EconomyEventType.ACHIEVEMENT_UNLOCKED]: { credits: 100, xp: 200 },
  [EconomyEventType.ACHIEVEMENT_CLAIMED]: { credits: 50, xp: 100 },
  [EconomyEventType.SHOP_PURCHASE]: { credits: 0, xp: 10 },
  [EconomyEventType.CONSUMABLE_USED]: { credits: 0, xp: 15 },
};

/**
 * Centralized, transactional Economy Service handling all rewarding actions,
 * anti-spam checks, reward calculations, and double-entry ledger persistence.
 */
export class EconomyService {
  private readonly repository: EconomyRepository;
  private readonly eventBus?: EventBus<CoreEvents> | undefined;
  private readonly antiSpam: AntiSpamEvaluator;
  private readonly rules: Record<EconomyEventType, RewardRule>;

  constructor(options: EconomyServiceOptions) {
    this.repository = options.repository;
    this.eventBus = options.eventBus;
    this.antiSpam = options.antiSpam ?? new AntiSpamEvaluator();
    this.rules = {
      ...DEFAULT_REWARD_RULES,
      ...options.customRules,
    };
  }

  /**
   * Returns the AntiSpamEvaluator instance.
   */
  public getAntiSpam(): AntiSpamEvaluator {
    return this.antiSpam;
  }

  /**
   * Processes an EconomyEvent:
   * 1. Evaluates anti-spam rules (if applicable).
   * 2. Computes credits and XP with multipliers.
   * 3. Atomically applies balance changes and logs transaction.
   * 4. Emits balance updated events.
   */
  public async handleEvent(event: EconomyEvent): Promise<RewardResult> {
    // 1. Anti-spam evaluation for MESSAGE_SENT
    if (event.type === EconomyEventType.MESSAGE_SENT) {
      const meta = (event.metadata ?? {}) as Partial<MessageActivityMetadata>;
      const content = typeof meta.content === 'string' ? meta.content : '';
      const timestamp = typeof meta.timestamp === 'number' ? meta.timestamp : undefined;

      const evalResult = this.antiSpam.evaluateMessage(
        event.userId,
        event.guildId,
        content,
        timestamp,
      );

      if (!evalResult.isAllowed) {
        return {
          awarded: false,
          reason: evalResult.reason,
          credits: 0,
          xp: 0,
        };
      }
    }

    // 2. Determine base rewards & multipliers
    const rule = this.rules[event.type as EconomyEventType] ?? { credits: 0, xp: 0 };
    const metaMultiplier = typeof event.metadata?.multiplier === 'number' ? event.metadata.multiplier : 1;
    const finalCredits = Math.max(0, Math.floor(rule.credits * metaMultiplier));
    const finalXp = Math.max(0, Math.floor(rule.xp * metaMultiplier));

    // If zero credits and zero XP are to be awarded
    if (finalCredits === 0 && finalXp === 0) {
      return {
        awarded: true,
        credits: 0,
        xp: 0,
      };
    }

    // 3. Atomically update wallet balance if credits > 0
    let walletBalance: number | bigint;
    let bankBalance: number | bigint;
    let netWorth: number | bigint;
    let transactionId: string | undefined;

    if (finalCredits > 0) {
      const modResult = await this.repository.modifyBalance({
        userId: event.userId,
        guildId: event.guildId,
        walletDelta: finalCredits,
        type: event.type,
        source: event.source,
        metadata: {
          ...event.metadata,
          xpAwarded: finalXp,
        },
      });

      walletBalance = modResult.balance.walletBalance;
      bankBalance = modResult.balance.bankBalance;
      netWorth = modResult.balance.netWorth;
      transactionId = modResult.transaction.id;

      // 4. Publish EventBus notification if available
      if (this.eventBus) {
        const prevBal = Number(modResult.transaction.balanceBefore);
        const newBal = Number(modResult.transaction.balanceAfter);
        await this.eventBus.emit('economy:balanceUpdated', {
          userId: event.userId,
          guildId: event.guildId ?? 'global',
          previousBalance: prevBal,
          newBalance: newBal,
          reason: event.type,
        });
      }
    } else {
      const bal = await this.repository.getOrCreateBalance(event.userId);
      walletBalance = bal.walletBalance;
      bankBalance = bal.bankBalance;
      netWorth = bal.netWorth;
    }

    return {
      awarded: true,
      credits: finalCredits,
      xp: finalXp,
      walletBalance,
      bankBalance,
      netWorth,
      transactionId,
    };
  }

  /**
   * Retrieves user balance details.
   */
  public async getBalance(userId: string) {
    return this.repository.getOrCreateBalance(userId);
  }
}
