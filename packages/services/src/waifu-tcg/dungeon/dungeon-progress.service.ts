import type { PlayerEnergyRepository, TcgConfigRepository } from '@ririko/database';
import type { ItemGrantService } from '../equipment/item-grant.service.js';

/** Extra stats per consecutive defeat on the same floor. */
export const PITY_STEP = 0.1;
/** Maximum pity blessing. */
export const PITY_CAP = 0.3;
/** Floors whose defeats refund part of the energy spent. */
export const ENERGY_REFUND_MAX_FLOOR = 10;
/** Share of energy refunded on a defeat in the refund floors. */
export const ENERGY_REFUND_SHARE = 0.5;
/** Clears in this many turns or fewer earn the speed star. */
export const STAR_TURN_LIMIT = 8;
/** Crafting Dust per floor number for the first 3-star clear of a floor. */
export const THREE_STAR_DUST_PER_FLOOR = 10;

interface StoredProgress {
  pity?: { floor: number; losses: number } | undefined;
  stars?: Record<string, number> | undefined;
}

export interface DungeonBattleOutcome {
  victory: boolean;
  forfeited: boolean;
  turns: number;
  potionsUsed: number;
  energySpent: number;
}

export interface DungeonProgressOutcome {
  /** Stars earned this battle (0 on a defeat). */
  stars: number;
  /** Best stars ever on this floor, after this battle. */
  bestStars: number;
  /** Dust granted for reaching 3 stars on this floor for the first time. */
  threeStarDust: number;
  /** Pity blessing waiting for the next attempt on this floor. */
  nextPityBonus: number;
  energyRefunded: number;
}

/**
 * Per-player dungeon extras that keep a climb rewarding and always possible:
 * - Pity blessing: each real defeat on a floor adds +10% stats (max +30%) until it is cleared.
 * - Energy refund: defeats on floors 1-10 give back half the energy.
 * - Star ratings: 1 for the clear, +1 for a clear in ≤8 turns, +1 for using no potions.
 *   A floor's first 3-star clear pays bonus Crafting Dust.
 * State is kept per user and season in tcg_system_configs (no schema change).
 */
export class DungeonProgressService {
  constructor(
    private readonly configRepo: TcgConfigRepository,
    private readonly energyRepo?: PlayerEnergyRepository | undefined,
    private readonly grants?: ItemGrantService | undefined,
  ) {}

  private key(userId: string, seasonId: string): string {
    return `dungeon:progress:${seasonId}:${userId}`;
  }

  private async load(userId: string, seasonId: string): Promise<StoredProgress> {
    return (await this.configRepo.getConfig<StoredProgress>(this.key(userId, seasonId))) ?? {};
  }

  async getPityBonus(userId: string, seasonId: string, floorNumber: number): Promise<number> {
    const { pity } = await this.load(userId, seasonId);
    if (!pity || pity.floor !== floorNumber) return 0;
    return Math.min(PITY_CAP, pity.losses * PITY_STEP);
  }

  async getStars(userId: string, seasonId: string): Promise<Record<string, number>> {
    return (await this.load(userId, seasonId)).stars ?? {};
  }

  async recordOutcome(
    userId: string,
    seasonId: string,
    floorNumber: number,
    outcome: DungeonBattleOutcome,
  ): Promise<DungeonProgressOutcome> {
    const progress = await this.load(userId, seasonId);
    const stars = { ...(progress.stars ?? {}) };
    const previousBest = stars[String(floorNumber)] ?? 0;
    let earned = 0;
    let threeStarDust = 0;
    let energyRefunded = 0;
    let pity = progress.pity;

    if (outcome.victory) {
      earned = 1 + (outcome.turns <= STAR_TURN_LIMIT ? 1 : 0) + (outcome.potionsUsed === 0 ? 1 : 0);
      if (earned > previousBest) stars[String(floorNumber)] = earned;
      if (earned === 3 && previousBest < 3 && this.grants) {
        threeStarDust = floorNumber * THREE_STAR_DUST_PER_FLOOR;
        await this.grants.grant(userId, 'CRAFTING_DUST', threeStarDust, 'DUNGEON_STARS');
      }
      if (pity?.floor === floorNumber) pity = undefined;
    } else if (!outcome.forfeited) {
      pity = { floor: floorNumber, losses: pity?.floor === floorNumber ? pity.losses + 1 : 1 };
      if (floorNumber <= ENERGY_REFUND_MAX_FLOOR && outcome.energySpent > 0 && this.energyRepo) {
        energyRefunded = Math.floor(outcome.energySpent * ENERGY_REFUND_SHARE);
        const energy = await this.energyRepo.getOrCreate(userId);
        await this.energyRepo.update(userId, {
          currentEnergy: Math.min(energy.maxEnergy, energy.currentEnergy + energyRefunded),
        });
      }
    }

    await this.configRepo.setConfig(this.key(userId, seasonId), { pity, stars }, 'system');

    return {
      stars: earned,
      bestStars: Math.max(previousBest, earned),
      threeStarDust,
      nextPityBonus: pity?.floor === floorNumber ? Math.min(PITY_CAP, pity.losses * PITY_STEP) : 0,
      energyRefunded,
    };
  }
}

/** Result-screen lines for a finished battle. */
export function formatProgressOutcome(outcome: DungeonProgressOutcome): string {
  const lines: string[] = [];
  if (outcome.stars > 0) {
    lines.push(
      `${'⭐'.repeat(outcome.stars)}${'☆'.repeat(3 - outcome.stars)} **${outcome.stars}/3 stars** (best ${outcome.bestStars}/3)`,
    );
    if (outcome.stars < 3) lines.push(`*Stars: clear • ≤${STAR_TURN_LIMIT} turns • no potions*`);
  }
  if (outcome.threeStarDust > 0)
    lines.push(`🌟 **First 3-star clear!** +${outcome.threeStarDust} Crafting Dust`);
  if (outcome.nextPityBonus > 0) {
    lines.push(
      `🕊️ **Pity Blessing:** +${Math.round(outcome.nextPityBonus * 100)}% stats on your next attempt at this floor`,
    );
  }
  if (outcome.energyRefunded > 0) lines.push(`⚡ Refunded **${outcome.energyRefunded} energy**`);
  return lines.join('\n');
}
