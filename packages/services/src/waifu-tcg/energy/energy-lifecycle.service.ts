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

/** The global energy rules (owner console `/owner/tcg`, `ririko tcg:rules`). */
export interface EnergyRules {
  globalCap: number;
  baseCapacity: number;
  scalingPerLevel: number;
  dailyPotionLimit: number;
  maxBonusCap: number;
  dailyBonusIncrement: number;
}

export const DEFAULT_ENERGY_RULES: EnergyRules = {
  globalCap: DEFAULT_GLOBAL_ENERGY_CAP,
  baseCapacity: 100,
  scalingPerLevel: 2,
  dailyPotionLimit: 3,
  maxBonusCap: 50,
  dailyBonusIncrement: 5,
};

/** Energy capacity at `level`: the base, a step per level and milestone bonuses, up to the cap. */
export function calculateMaxEnergy(
  level: number,
  globalCap = DEFAULT_GLOBAL_ENERGY_CAP,
  capacity: Pick<EnergyRules, 'baseCapacity' | 'scalingPerLevel'> = DEFAULT_ENERGY_RULES,
): number {
  const clampedLevel = Math.max(1, level);
  const base = capacity.baseCapacity + Math.floor((clampedLevel - 1) * capacity.scalingPerLevel);
  const milestone = getEnergyMilestoneBonus(clampedLevel);
  const total = base + milestone;
  return Math.min(globalCap, total);
}

/** Resolves a user's account-wide level. Injected so this service owns level lookup. */
export type PlayerLevelResolver = (userId: string) => Promise<number>;

/** Resolves the current energy rules; the bot reads the owner's saved TCG rules. */
export type EnergyRulesResolver = () => Promise<EnergyRules>;

export interface EnergyLifecycleOptions {
  resetSchedule?: ResetSchedule | undefined;
  /** Cap used without a rules resolver. */
  globalCap?: number | undefined;
  /** Resolves account-wide player level; omit to keep each player's stored capacity. */
  levelResolver?: PlayerLevelResolver | undefined;
  /**
   * Resolves capacity, potion and bonus energy rules; omit to use the defaults with the
   * `globalCap` above and no daily bonus energy.
   */
  rulesResolver?: EnergyRulesResolver | undefined;
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
  private readonly rulesResolver: EnergyRulesResolver | undefined;

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
    this.rulesResolver = options.rulesResolver;
  }

  /** The energy rules in force now. */
  async rules(): Promise<EnergyRules> {
    if (this.rulesResolver) return this.rulesResolver();
    return { ...DEFAULT_ENERGY_RULES, globalCap: this.globalCap, dailyBonusIncrement: 0 };
  }

  /** Energy potions a player may use per reset day. */
  async dailyPotionLimit(): Promise<number> {
    return (await this.rules()).dailyPotionLimit;
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
    rules: EnergyRules,
    explicitLevel?: number,
    globalCap = rules.globalCap,
  ): Promise<number> {
    if (explicitLevel !== undefined) {
      return calculateMaxEnergy(explicitLevel, globalCap, rules);
    }
    if (!this.levelResolver) {
      return storedMax;
    }
    const level = await this.levelResolver(userId);
    return calculateMaxEnergy(level, globalCap, rules);
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
    const rules = await this.rules();

    const maxCapacity = await this.resolveMaxEnergy(
      userId,
      record.maxEnergy,
      rules,
      playerLevel,
      globalCap,
    );

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
      if (rules.dailyBonusIncrement > 0) {
        const newBonus = Math.min(rules.maxBonusCap, currentBonus + rules.dailyBonusIncrement);
        if (newBonus !== currentBonus) {
          updateData.bonusEnergy = newBonus;
          currentBonus = newBonus;
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
    maxDailyLimit?: number,
  ): ReturnType<PlayerEnergyRepository['consumeEnergyPotion']> {
    await this.getOrReconcileUserEnergy(userId);
    const limit = maxDailyLimit ?? (await this.dailyPotionLimit());
    return this.energyRepo.consumeEnergyPotion(userId, energyRestored, limit);
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

    const maxCapacity = await this.resolveMaxEnergy(
      userId,
      record.maxEnergy,
      await this.rules(),
      playerLevel,
      globalCap,
    );

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
