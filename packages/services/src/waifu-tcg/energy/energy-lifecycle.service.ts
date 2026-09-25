import type { PlayerEnergyRepository, PlayerEnergy, XpRepository } from '@ririko/database';
import { DEFAULT_RESET_SCHEDULE, getResetDayKey, type ResetSchedule } from '@ririko/core';

export const DEFAULT_GLOBAL_ENERGY_CAP = 300;

export function getEnergyMilestoneBonus(level: number): number {
  if (level >= 100) return 75;
  if (level >= 75) return 50;
  if (level >= 50) return 30;
  if (level >= 25) return 15;
  if (level >= 10) return 5;
  return 0;
}

export function calculateMaxEnergy(level: number, globalCap = DEFAULT_GLOBAL_ENERGY_CAP): number {
  const clampedLevel = Math.max(1, level);
  const base = 100 + Math.floor((clampedLevel - 1) * 2);
  const milestone = getEnergyMilestoneBonus(clampedLevel);
  const total = base + milestone;
  return Math.min(globalCap, total);
}

/** Resolves a user's account-wide level. Injected so this service owns level lookup. */
export type PlayerLevelResolver = (userId: string) => Promise<number>;

export interface BonusEnergyConfig {
  maxBonusCap: number;
  dailyIncrement: number;
}

/** Resolves bonus energy configuration (daily increment and maximum cap). */
export type BonusConfigResolver = () => Promise<BonusEnergyConfig>;

export interface EnergyLifecycleOptions {
  resetSchedule?: ResetSchedule | undefined;
  globalCap?: number | undefined;
  /** Resolves account-wide player level; omit to keep each player's stored capacity. */
  levelResolver?: PlayerLevelResolver | undefined;
  /** Resolves bonus energy configuration; omit to disable daily bonus energy increments. */
  bonusConfigResolver?: BonusConfigResolver | undefined;
}

/**
 * Builds a level resolver from total XP across every guild.
 *
 * Energy is a global per-user resource while `xp_accounts` is keyed per guild, so account-wide
 * level is derived from the user's summed XP rather than from any single guild's row.
 */
export function createXpLevelResolver(
  xpRepo: XpRepository,
  levelFromTotalXp: (totalXp: number) => number,
): PlayerLevelResolver {
  return async (userId: string): Promise<number> => {
    const totalXp = await xpRepo.getUserTotalXp(userId);
    return levelFromTotalXp(totalXp);
  };
}

export interface SpendEnergyResult {
  success: boolean;
  currentEnergy: number;
  maxEnergy: number;
  reason?: string | undefined;
}

/**
 * Owns the player energy lifecycle: daily replenishment on the configured reset boundary,
 * level-scaled capacity, and every debit against the pool.
 *
 * Reconciliation is lazy. Each read or spend evaluates whether the reset boundary has passed
 * since the stored `lastResetDate`, so no scheduled job is required and a bot that was offline
 * across a boundary still replenishes correctly on the player's next interaction.
 */
export class EnergyLifecycleService {
  private readonly resetSchedule: ResetSchedule;
  private readonly globalCap: number;
  private readonly levelResolver: PlayerLevelResolver | undefined;
  private readonly bonusConfigResolver: BonusConfigResolver | undefined;

  constructor(
    private readonly energyRepo: PlayerEnergyRepository,
    resetScheduleOrOptions: ResetSchedule | EnergyLifecycleOptions = DEFAULT_RESET_SCHEDULE,
  ) {
    // Accepts a bare ResetSchedule for callers that only need the boundary.
    const options: EnergyLifecycleOptions =
      'offsetMinutes' in resetScheduleOrOptions
        ? { resetSchedule: resetScheduleOrOptions }
        : resetScheduleOrOptions;

    this.resetSchedule = options.resetSchedule ?? DEFAULT_RESET_SCHEDULE;
    this.globalCap = options.globalCap ?? DEFAULT_GLOBAL_ENERGY_CAP;
    this.levelResolver = options.levelResolver;
    this.bonusConfigResolver = options.bonusConfigResolver;
  }

  /**
   * Resolves the capacity a player should currently have.
   *
   * Without a level resolver and without an explicit level, the stored capacity is kept: a
   * naive default of level 1 would shrink a high-level player's pool from (say) 228 to 100.
   */
  private async resolveMaxEnergy(
    userId: string,
    storedMax: number,
    explicitLevel?: number,
  ): Promise<number> {
    if (explicitLevel !== undefined) {
      return calculateMaxEnergy(explicitLevel, this.globalCap);
    }
    if (!this.levelResolver) {
      return storedMax;
    }
    const level = await this.levelResolver(userId);
    return calculateMaxEnergy(level, this.globalCap);
  }

  /**
   * Lazily reconciles a user's energy pool against the reset boundary and their current level.
   * When a new reset day has arrived:
   * 1. Resets the daily potion counter to 0.
   * 2. Replenishes active energy up to capacity, preserving any overflow above it.
   */
  async getOrReconcileUserEnergy(
    userId: string,
    playerLevel?: number,
    globalCap?: number,
  ): Promise<PlayerEnergy> {
    const record = await this.energyRepo.getOrCreate(userId);
    const today = getResetDayKey(new Date(), this.resetSchedule);

    const maxCapacity =
      globalCap !== undefined && playerLevel !== undefined
        ? calculateMaxEnergy(playerLevel, globalCap)
        : await this.resolveMaxEnergy(userId, record.maxEnergy, playerLevel);

    let needsUpdate = false;
    const updateData: Partial<PlayerEnergy> = {};

    // 1. Scale capacity with newly attained player level
    if (record.maxEnergy !== maxCapacity) {
      updateData.maxEnergy = maxCapacity;
      needsUpdate = true;
    }

    // 2. Apply the daily rollover if the reset boundary has passed
    if (record.lastResetDate !== today) {
      updateData.lastResetDate = today;
      updateData.dailyEnergyPotsUsed = 0;
      updateData.lastReplenishedAt = new Date();

      let currentBonus = record.bonusEnergy ?? 0;
      if (this.bonusConfigResolver) {
        const { maxBonusCap, dailyIncrement } = await this.bonusConfigResolver();
        if (dailyIncrement > 0) {
          const newBonus = Math.min(maxBonusCap, currentBonus + dailyIncrement);
          if (newBonus !== currentBonus) {
            updateData.bonusEnergy = newBonus;
            currentBonus = newBonus;
          }
        }
      }

      // Replenish up to effective capacity (maxCapacity + bonusEnergy) if below it, preserving overflow above it
      const effectiveCap = maxCapacity + currentBonus;
      if (record.currentEnergy < effectiveCap) {
        updateData.currentEnergy = effectiveCap;
      }
      needsUpdate = true;
    }

    if (needsUpdate) {
      return this.energyRepo.update(userId, updateData);
    }

    return record;
  }

  /**
   * Spends energy on a game activity, reconciling the daily boundary first so a player who
   * has not been seen since the last reset is replenished before the debit is evaluated.
   */
  async spendEnergy(userId: string, amount: number): Promise<SpendEnergyResult> {
    const reconciled = await this.getOrReconcileUserEnergy(userId);
    const result = await this.energyRepo.consumeEnergy(userId, amount);

    return {
      success: result.success,
      currentEnergy: result.currentEnergy,
      maxEnergy: reconciled.maxEnergy,
      reason: result.reason,
    };
  }

  /**
   * Consumes an energy potion, reconciling first so the daily potion ceiling is evaluated
   * against the current reset day rather than a stale one.
   */
  async consumePotion(
    userId: string,
    energyRestored: number,
    maxDailyLimit: number,
  ): ReturnType<PlayerEnergyRepository['consumeEnergyPotion']> {
    await this.getOrReconcileUserEnergy(userId);
    return this.energyRepo.consumeEnergyPotion(userId, energyRestored, maxDailyLimit);
  }

  /**
   * Refunds energy back into the pool, clamped to the player's capacity. Backs the documented
   * half-energy refund on defeats in the early dungeon floors.
   */
  async refundEnergy(userId: string, amount: number): Promise<PlayerEnergy> {
    const record = await this.getOrReconcileUserEnergy(userId);
    if (amount <= 0) return record;

    const cap = record.maxEnergy + record.bonusEnergy;
    const restored = Math.min(cap, record.currentEnergy + amount);
    if (restored === record.currentEnergy) return record;

    return this.energyRepo.update(userId, { currentEnergy: restored });
  }

  /**
   * Manually triggers the daily replenishment for a specific user, raising energy to capacity.
   */
  async replenishUserEnergy(
    userId: string,
    playerLevel?: number,
    globalCap?: number,
  ): Promise<PlayerEnergy> {
    const record = await this.energyRepo.getOrCreate(userId);
    const today = getResetDayKey(new Date(), this.resetSchedule);

    const maxCapacity =
      globalCap !== undefined && playerLevel !== undefined
        ? calculateMaxEnergy(playerLevel, globalCap)
        : await this.resolveMaxEnergy(userId, record.maxEnergy, playerLevel);

    const newCurrent = Math.max(record.currentEnergy, maxCapacity);

    return this.energyRepo.update(userId, {
      currentEnergy: newCurrent,
      maxEnergy: maxCapacity,
      dailyEnergyPotsUsed: 0,
      lastResetDate: today,
      lastReplenishedAt: new Date(),
    });
  }
}
