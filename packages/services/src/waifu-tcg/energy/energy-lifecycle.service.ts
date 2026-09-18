import type { PlayerEnergyRepository, PlayerEnergy } from '@ririko/database';

export const DEFAULT_GLOBAL_ENERGY_CAP = 300;

export function getEnergyMilestoneBonus(level: number): number {
  if (level >= 100) return 75;
  if (level >= 75) return 50;
  if (level >= 50) return 30;
  if (level >= 25) return 15;
  if (level >= 10) return 5;
  return 0;
}

export function calculateMaxEnergy(
  level: number,
  globalCap = DEFAULT_GLOBAL_ENERGY_CAP,
): number {
  const clampedLevel = Math.max(1, level);
  const base = 100 + Math.floor((clampedLevel - 1) * 2);
  const milestone = getEnergyMilestoneBonus(clampedLevel);
  const total = base + milestone;
  return Math.min(globalCap, total);
}

export class EnergyLifecycleService {
  constructor(private readonly energyRepo: PlayerEnergyRepository) {}

  /**
   * Lazily reconciles a user's energy pool based on current level and UTC date rollover.
   * If a new day has arrived:
   * 1. Resets daily potion usage counter to 0.
   * 2. Replenishes active energy up to maxCapacity (does not truncate overflow).
   */
  async getOrReconcileUserEnergy(
    userId: string,
    playerLevel = 1,
    globalCap = DEFAULT_GLOBAL_ENERGY_CAP,
  ): Promise<PlayerEnergy> {
    const record = await this.energyRepo.getOrCreate(userId);
    const today = new Date().toISOString().slice(0, 10);
    const maxCapacity = calculateMaxEnergy(playerLevel, globalCap);

    let needsUpdate = false;
    const updateData: Partial<PlayerEnergy> = {};

    // 1. Check if max energy needs to scale with newly attained player level
    if (record.maxEnergy !== maxCapacity) {
      updateData.maxEnergy = maxCapacity;
      needsUpdate = true;
    }

    // 2. Check if daily rollover has occurred
    if (record.lastResetDate !== today) {
      updateData.lastResetDate = today;
      updateData.dailyEnergyPotsUsed = 0;
      updateData.lastReplenishedAt = new Date();
      // Replenish up to maxCapacity if below capacity (preserve overflow)
      if (record.currentEnergy < maxCapacity) {
        updateData.currentEnergy = maxCapacity;
      }
      needsUpdate = true;
    }

    if (needsUpdate) {
      return this.energyRepo.update(userId, updateData);
    }

    return record;
  }

  /**
   * Manually triggers daily 00:00 UTC energy replenishment for a specific user.
   */
  async replenishUserEnergy(
    userId: string,
    playerLevel = 1,
    globalCap = DEFAULT_GLOBAL_ENERGY_CAP,
  ): Promise<PlayerEnergy> {
    const record = await this.energyRepo.getOrCreate(userId);
    const today = new Date().toISOString().slice(0, 10);
    const maxCapacity = calculateMaxEnergy(playerLevel, globalCap);

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
