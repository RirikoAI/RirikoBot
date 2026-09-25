export type ScalingModel = 'LINEAR' | 'POLYNOMIAL' | 'EXPONENTIAL' | 'HYBRID';

export type DungeonFloorType = 'STANDARD' | 'MINI_BOSS' | 'MAJOR_BOSS';

export interface MonsterStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface ScalingConfig {
  model?: ScalingModel;
  growthRate?: number; // r for exponential (default: 0.085)
  linearK?: number; // k for linear (default: 0.15)
  polyAlpha?: number; // alpha for polynomial (default: 0.08)
  polyBeta?: number; // beta for polynomial (default: 0.005)
  miniBossMultiplier?: number; // default: 1.75
  majorBossMultiplier?: number; // default: 3.2
  baseStats?: MonsterStats;
}

export const BASELINE_F1_STATS: Readonly<MonsterStats> = Object.freeze({
  hp: 1200,
  attack: 120,
  defense: 80,
  speed: 25,
});

export const SAMPLE_PROGRESSION_TABLE: Record<
  number,
  MonsterStats & { type: DungeonFloorType; check: string }
> = {
  1: {
    hp: 1200,
    attack: 120,
    defense: 80,
    speed: 25,
    type: 'STANDARD',
    check: 'Starter Gear check',
  },
  5: {
    hp: 3360,
    attack: 315,
    defense: 210,
    speed: 38,
    type: 'MINI_BOSS',
    check: 'Elemental Match check',
  },
  10: {
    hp: 10240,
    attack: 845,
    defense: 560,
    speed: 52,
    type: 'MAJOR_BOSS',
    check: 'Skill & Potion timing check',
  },
  20: {
    hp: 23100,
    attack: 1850,
    defense: 1220,
    speed: 78,
    type: 'MAJOR_BOSS',
    check: '+5 Enhanced Gear & Synergies',
  },
  30: {
    hp: 52100,
    attack: 4050,
    defense: 2680,
    speed: 115,
    type: 'MAJOR_BOSS',
    check: 'SR/UR Gear + Accessory check',
  },
  40: {
    hp: 117500,
    attack: 8900,
    defense: 5880,
    speed: 165,
    type: 'MAJOR_BOSS',
    check: 'Dual Elemental Barrier check',
  },
  50: {
    hp: 265000,
    attack: 19500,
    defense: 12900,
    speed: 230,
    type: 'MAJOR_BOSS',
    check: 'Mythic Endgame Master Challenge',
  },
};

export class ScalingEngine {
  private readonly model: ScalingModel;
  private readonly growthRate: number;
  private readonly linearK: number;
  private readonly polyAlpha: number;
  private readonly polyBeta: number;
  private readonly miniBossMultiplier: number;
  private readonly majorBossMultiplier: number;
  private readonly baseStats: MonsterStats;

  constructor(config: ScalingConfig = {}) {
    this.model = config.model ?? 'EXPONENTIAL';
    this.growthRate = config.growthRate ?? 0.085;
    this.linearK = config.linearK ?? 0.15;
    this.polyAlpha = config.polyAlpha ?? 0.08;
    this.polyBeta = config.polyBeta ?? 0.005;
    this.miniBossMultiplier = config.miniBossMultiplier ?? 1.75;
    this.majorBossMultiplier = config.majorBossMultiplier ?? 3.2;
    this.baseStats = config.baseStats ?? { ...BASELINE_F1_STATS };
  }

  /**
   * Identifies floor tier: Standard, Mini-Boss (every 5th except 10ths), or Major Boss (every 10th).
   */
  public getFloorType(floorNumber: number): DungeonFloorType {
    if (floorNumber <= 0) return 'STANDARD';
    if (floorNumber % 10 === 0) return 'MAJOR_BOSS';
    if (floorNumber % 5 === 0) return 'MINI_BOSS';
    return 'STANDARD';
  }

  /**
   * Returns boss multiplier for the specified floor.
   */
  public getBossMultiplier(floorNumber: number): number {
    const type = this.getFloorType(floorNumber);
    switch (type) {
      case 'MAJOR_BOSS':
        return this.majorBossMultiplier;
      case 'MINI_BOSS':
        return this.miniBossMultiplier;
      case 'STANDARD':
      default:
        return 1.0;
    }
  }

  /**
   * Computes monster stats for a specific floor using the active scaling model.
   */
  public calculateFloorStats(floorNumber: number, modelOverride?: ScalingModel): MonsterStats {
    const effectiveFloor = Math.max(1, floorNumber);
    const model = modelOverride ?? this.model;
    const bossMultiplier = this.getBossMultiplier(effectiveFloor);

    let rawScale: number;

    switch (model) {
      case 'LINEAR': {
        // Stat(F) = Base * (1 + k * (F - 1))
        rawScale = 1 + this.linearK * (effectiveFloor - 1);
        break;
      }

      case 'POLYNOMIAL': {
        // Stat(F) = Base * (1 + alpha * (F - 1) + beta * (F - 1)^2)
        const d = effectiveFloor - 1;
        rawScale = 1 + this.polyAlpha * d + this.polyBeta * Math.pow(d, 2);
        break;
      }

      case 'HYBRID': {
        // Linear (F1-10) -> Mid Exp (F11-25) -> High Exp (F26+)
        if (effectiveFloor <= 10) {
          rawScale = 1 + 0.12 * (effectiveFloor - 1);
        } else if (effectiveFloor <= 25) {
          const base10 = 1 + 0.12 * 9; // ~2.08
          rawScale = base10 * Math.pow(1 + 0.075, effectiveFloor - 10);
        } else {
          const base10 = 1 + 0.12 * 9;
          const base25 = base10 * Math.pow(1 + 0.075, 15);
          rawScale = base25 * Math.pow(1 + 0.12, effectiveFloor - 25);
        }
        break;
      }

      case 'EXPONENTIAL':
      default: {
        // Stat(F) = Base * (1 + r)^(F - 1)
        rawScale = Math.pow(1 + this.growthRate, effectiveFloor - 1);
        break;
      }
    }

    const totalScale = rawScale * bossMultiplier;

    return {
      hp: Math.round(this.baseStats.hp * totalScale),
      attack: Math.round(this.baseStats.attack * totalScale),
      defense: Math.round(this.baseStats.defense * totalScale),
      // Speed scales at a milder rate so turn order doesn't degenerate to infinity
      speed: Math.round(this.baseStats.speed * Math.pow(totalScale, 0.45)),
    };
  }

  /**
   * Retrieves reference stats from the sample table or computes via model.
   */
  public getSampleProgression(
    floorNumber: number,
  ): (MonsterStats & { type: DungeonFloorType; check: string }) | null {
    return SAMPLE_PROGRESSION_TABLE[floorNumber] ?? null;
  }
}
