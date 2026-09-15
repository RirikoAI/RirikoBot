import type { EconomyRepository } from '@ririko/database';
import type { DailyClaimResult, DailyStatus } from './types.js';

export interface DailyServiceOptions {
  repository: EconomyRepository;
  baseReward?: number | undefined;
  streakBonusPercent?: number | undefined;
  maxStreakBonusPercent?: number | undefined;
  cooldownWindowMs?: number | undefined;
  graceWindowMs?: number | undefined;
}

/**
 * Daily Claim & Streak Engine implementing Section 5.2 of docs/economy.md:
 * - Base reward: 250 credits.
 * - Daily streak multiplier: +5% per consecutive day, capping at 30 days (+150%).
 * - 24-hour claim window with a 12-hour grace period (36 hours total before streak resets).
 * - Anti-abuse: frozen accounts blocked from claiming.
 */
export class DailyService {
  private readonly repository: EconomyRepository;
  private readonly baseReward: number;
  private readonly streakBonusPercent: number;
  private readonly maxStreakBonusPercent: number;
  private readonly cooldownWindowMs: number;
  private readonly graceWindowMs: number;

  constructor(options: DailyServiceOptions) {
    this.repository = options.repository;
    this.baseReward = options.baseReward ?? 250;
    this.streakBonusPercent = options.streakBonusPercent ?? 0.05; // 5% per day
    this.maxStreakBonusPercent = options.maxStreakBonusPercent ?? 1.5; // Cap at +150% (30 days)
    this.cooldownWindowMs = options.cooldownWindowMs ?? 24 * 3600 * 1000; // 24 hours
    this.graceWindowMs = options.graceWindowMs ?? 12 * 3600 * 1000; // 12 hours grace
  }

  /**
   * Computes the streak multiplier (e.g. 1.0 for Day 1, 1.05 for Day 2, up to 2.5 for Day 31).
   */
  public calculateMultiplier(streak: number): number {
    if (streak <= 1) return 1.0;
    const bonus = Math.min(this.maxStreakBonusPercent, (streak - 1) * this.streakBonusPercent);
    return Number((1.0 + bonus).toFixed(2));
  }

  /**
   * Computes the final credit reward for a given streak number.
   */
  public calculateReward(streak: number): number {
    const multiplier = this.calculateMultiplier(streak);
    return Math.round(this.baseReward * multiplier);
  }

  /**
   * Inspects daily reward status, streak, and next claim time for a user.
   */
  public async getStatus(userId: string, nowMs = Date.now()): Promise<DailyStatus> {
    const account = await this.repository.getOrCreateAccount(userId);

    let canClaim: boolean;
    let timeUntilNextClaimMs = 0;
    let timeUntilResetMs = 0;
    let nextStreak: number;

    if (!account.lastDailyAt) {
      canClaim = !account.isFrozen;
      nextStreak = 1;
    } else {
      const elapsed = nowMs - account.lastDailyAt.getTime();
      const totalResetCutoff = this.cooldownWindowMs + this.graceWindowMs;

      if (elapsed < this.cooldownWindowMs) {
        canClaim = false;
        timeUntilNextClaimMs = this.cooldownWindowMs - elapsed;
        timeUntilResetMs = Math.max(0, totalResetCutoff - elapsed);
        nextStreak = account.dailyStreak + 1;
      } else if (elapsed <= totalResetCutoff) {
        canClaim = !account.isFrozen;
        timeUntilNextClaimMs = 0;
        timeUntilResetMs = totalResetCutoff - elapsed;
        nextStreak = account.dailyStreak + 1;
      } else {
        // Grace period expired, resets to 1
        canClaim = !account.isFrozen;
        timeUntilNextClaimMs = 0;
        timeUntilResetMs = 0;
        nextStreak = 1;
      }
    }

    const multiplier = this.calculateMultiplier(nextStreak);
    const rewardCredits = this.calculateReward(nextStreak);

    return {
      canClaim,
      isFrozen: account.isFrozen,
      currentStreak: account.dailyStreak,
      nextStreak,
      multiplier,
      rewardCredits,
      lastDailyAt: account.lastDailyAt,
      timeUntilNextClaimMs,
      timeUntilResetMs,
    };
  }

  /**
   * Executes a daily reward claim with streak progression and double-entry transaction.
   */
  public async claimDaily(
    userId: string,
    guildId?: string,
    nowMs = Date.now(),
  ): Promise<DailyClaimResult> {
    const account = await this.repository.getOrCreateAccount(userId);

    // 1. Account freeze verification
    if (account.isFrozen) {
      return {
        success: false,
        reason: 'ACCOUNT_FROZEN',
        creditsAwarded: 0,
        streak: account.dailyStreak,
        multiplier: 1.0,
        wasReset: false,
      };
    }

    // 2. Cooldown & Grace period verification
    let newStreak = 1;
    let wasReset = false;
    const totalResetCutoff = this.cooldownWindowMs + this.graceWindowMs;

    if (account.lastDailyAt) {
      const elapsed = nowMs - account.lastDailyAt.getTime();

      if (elapsed < this.cooldownWindowMs) {
        const remainingSeconds = Math.ceil((this.cooldownWindowMs - elapsed) / 1000);
        return {
          success: false,
          reason: `Daily reward is on cooldown. Try again in ${remainingSeconds}s.`,
          creditsAwarded: 0,
          streak: account.dailyStreak,
          multiplier: this.calculateMultiplier(account.dailyStreak),
          nextClaimAt: new Date(account.lastDailyAt.getTime() + this.cooldownWindowMs),
          graceExpiresAt: new Date(account.lastDailyAt.getTime() + totalResetCutoff),
          wasReset: false,
        };
      } else if (elapsed <= totalResetCutoff) {
        // Within 24-36h window: streak increments!
        newStreak = account.dailyStreak + 1;
        wasReset = false;
      } else {
        // Beyond 36 hours: streak resets to 1
        newStreak = 1;
        wasReset = true;
      }
    }

    const multiplier = this.calculateMultiplier(newStreak);
    const creditsToAward = this.calculateReward(newStreak);
    const claimDate = new Date(nowMs);

    // 3. Atomically update account streak and credit wallet balance
    await this.repository.updateAccount(userId, {
      dailyStreak: newStreak,
      lastDailyAt: claimDate,
    });

    const balanceResult = await this.repository.modifyBalance({
      userId,
      guildId,
      walletDelta: creditsToAward,
      type: 'DAILY',
      source: 'DAILY_CLAIM',
      metadata: {
        streak: newStreak,
        multiplier,
        wasReset,
      },
    });

    return {
      success: true,
      creditsAwarded: creditsToAward,
      streak: newStreak,
      multiplier,
      nextClaimAt: new Date(nowMs + this.cooldownWindowMs),
      graceExpiresAt: new Date(nowMs + totalResetCutoff),
      wasReset,
      walletBalance: balanceResult.balance.walletBalance,
      transactionId: balanceResult.transaction.id,
    };
  }
}
