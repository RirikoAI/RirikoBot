import type { EconomyRepository } from '@ririko/database';
import {
  DEFAULT_RESET_SCHEDULE,
  getResetDayIndex,
  getNextResetAt,
  type ResetSchedule,
} from '@ririko/core';
import type { DailyClaimResult, DailyStatus } from './types.js';

export interface DailyServiceOptions {
  repository: EconomyRepository;
  baseReward?: number | undefined;
  streakBonusPercent?: number | undefined;
  maxStreakBonusPercent?: number | undefined;
  /** Reset boundary governing when a new claim becomes available. */
  resetSchedule?: ResetSchedule | undefined;
  /** Consecutive missed days tolerated before the streak is wiped. 0 disables forgiveness. */
  streakForgiveness?: number | undefined;
}

/** Outcome of comparing a claim against the previous one. */
interface StreakOutcome {
  nextStreak: number;
  missedDays: number;
  wasReset: boolean;
}

export const DEFAULT_STREAK_FORGIVENESS = 3;

/**
 * Daily Claim & Streak Engine implementing Section 5.2 of docs/economy.md:
 * - Base reward: 250 credits.
 * - Daily streak multiplier: +5% per consecutive day, capping at 30 days (+150%).
 * - One claim per reset day, on the shared configurable boundary (default 00:00 GMT+8).
 * - Consecutive-miss forgiveness: missing fewer than `streakForgiveness` consecutive reset
 *   days preserves the streak, and the missed days are skipped rather than counted. Reaching
 *   the threshold wipes the streak, and the claim that follows counts as day 1.
 * - Anti-abuse: frozen accounts blocked from claiming.
 */
export class DailyService {
  private readonly repository: EconomyRepository;
  private readonly baseReward: number;
  private readonly streakBonusPercent: number;
  private readonly maxStreakBonusPercent: number;
  private readonly resetSchedule: ResetSchedule;
  private readonly streakForgiveness: number;

  constructor(options: DailyServiceOptions) {
    this.repository = options.repository;
    this.baseReward = options.baseReward ?? 250;
    this.streakBonusPercent = options.streakBonusPercent ?? 0.05; // 5% per day
    this.maxStreakBonusPercent = options.maxStreakBonusPercent ?? 1.5; // Cap at +150% (30 days)
    this.resetSchedule = options.resetSchedule ?? DEFAULT_RESET_SCHEDULE;
    this.streakForgiveness = options.streakForgiveness ?? DEFAULT_STREAK_FORGIVENESS;
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
   * Resolves what a claim at `nowMs` does to a streak last advanced at `lastDailyAt`.
   *
   * Missed days are the whole reset days that elapsed between the two claims. Below the
   * forgiveness threshold the streak simply advances by one — the missed days are skipped,
   * never counted — so a 15-day streak interrupted by two missed days resumes at 16.
   */
  private resolveStreak(
    lastDailyAt: Date | null,
    currentStreak: number,
    nowMs: number,
  ): StreakOutcome {
    if (!lastDailyAt) {
      return { nextStreak: 1, missedDays: 0, wasReset: false };
    }

    const missedDays = this.countMissedDays(lastDailyAt, nowMs);

    if (this.isStreakBroken(missedDays)) {
      return { nextStreak: 1, missedDays, wasReset: true };
    }

    return { nextStreak: currentStreak + 1, missedDays, wasReset: false };
  }

  /** Whole reset days that passed without a claim between `lastDailyAt` and `nowMs`. */
  private countMissedDays(lastDailyAt: Date, nowMs: number): number {
    const lastIndex = getResetDayIndex(lastDailyAt, this.resetSchedule);
    const todayIndex = getResetDayIndex(new Date(nowMs), this.resetSchedule);
    return Math.max(0, todayIndex - lastIndex - 1);
  }

  /** A streak dies once the missed days reach the forgiveness threshold. */
  private isStreakBroken(missedDays: number): boolean {
    if (this.streakForgiveness <= 0) return missedDays > 0;
    return missedDays >= this.streakForgiveness;
  }

  /**
   * Inspects daily reward status, streak, and next reset time for a user.
   */
  public async getStatus(userId: string, nowMs = Date.now()): Promise<DailyStatus> {
    const account = await this.repository.getOrCreateAccount(userId);
    const now = new Date(nowMs);

    const alreadyClaimedToday =
      account.lastDailyAt !== null &&
      getResetDayIndex(account.lastDailyAt, this.resetSchedule) ===
        getResetDayIndex(now, this.resetSchedule);

    const { nextStreak, missedDays } = this.resolveStreak(
      account.lastDailyAt,
      account.dailyStreak,
      nowMs,
    );

    // A streak already doomed by inactivity is reported as gone, even before the next claim.
    const currentStreak = this.isStreakBroken(missedDays) ? 0 : account.dailyStreak;

    const timeUntilResetMs = Math.max(0, getNextResetAt(now, this.resetSchedule).getTime() - nowMs);

    return {
      canClaim: !account.isFrozen && !alreadyClaimedToday,
      isFrozen: account.isFrozen,
      currentStreak,
      nextStreak,
      multiplier: this.calculateMultiplier(nextStreak),
      rewardCredits: this.calculateReward(nextStreak),
      lastDailyAt: account.lastDailyAt,
      timeUntilNextClaimMs: alreadyClaimedToday ? timeUntilResetMs : 0,
      timeUntilResetMs,
      missedDays,
      forgivenessRemaining: Math.max(0, this.streakForgiveness - missedDays),
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
    const now = new Date(nowMs);
    const nextResetAt = getNextResetAt(now, this.resetSchedule);

    // 1. Account freeze verification
    if (account.isFrozen) {
      return {
        success: false,
        reason: 'ACCOUNT_FROZEN',
        creditsAwarded: 0,
        streak: account.dailyStreak,
        multiplier: 1.0,
        wasReset: false,
        missedDays: 0,
      };
    }

    // 2. One claim per reset day
    if (
      account.lastDailyAt &&
      getResetDayIndex(account.lastDailyAt, this.resetSchedule) ===
        getResetDayIndex(now, this.resetSchedule)
    ) {
      const remainingSeconds = Math.ceil((nextResetAt.getTime() - nowMs) / 1000);
      return {
        success: false,
        reason: `Daily reward already claimed today. Resets in ${remainingSeconds}s.`,
        creditsAwarded: 0,
        streak: account.dailyStreak,
        multiplier: this.calculateMultiplier(account.dailyStreak),
        nextClaimAt: nextResetAt,
        wasReset: false,
        missedDays: 0,
      };
    }

    // 3. Streak progression with consecutive-miss forgiveness
    const { nextStreak, missedDays, wasReset } = this.resolveStreak(
      account.lastDailyAt,
      account.dailyStreak,
      nowMs,
    );

    const multiplier = this.calculateMultiplier(nextStreak);
    const creditsToAward = this.calculateReward(nextStreak);

    // 4. Atomically update account streak and credit wallet balance
    await this.repository.updateAccount(userId, {
      dailyStreak: nextStreak,
      lastDailyAt: now,
    });

    const balanceResult = await this.repository.modifyBalance({
      userId,
      guildId,
      walletDelta: creditsToAward,
      type: 'DAILY',
      source: 'DAILY_CLAIM',
      metadata: {
        streak: nextStreak,
        multiplier,
        wasReset,
        missedDays,
      },
    });

    return {
      success: true,
      creditsAwarded: creditsToAward,
      streak: nextStreak,
      multiplier,
      nextClaimAt: nextResetAt,
      wasReset,
      missedDays,
      walletBalance: balanceResult.balance.walletBalance,
      transactionId: balanceResult.transaction.id,
    };
  }
}
