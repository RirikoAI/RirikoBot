import type { CardPrimaryStats } from './card-generator.js';

export interface LevelUpResult {
  newLevel: number;
  newExp: number;
  levelsGained: number;
  isMaxLevel: boolean;
  expToNextLevel: number;
}

export class LevelingEngine {
  /**
   * Calculates EXP required to advance from currentLevel to currentLevel + 1.
   * Formula: floor(100 * level^1.5).
   */
  getExpForNextLevel(currentLevel: number): number {
    if (currentLevel < 1) return 100;
    return Math.floor(100 * Math.pow(currentLevel, 1.5));
  }

  /**
   * Adds EXP to a card and computes level advancement, respecting maxLevel.
   */
  addExp(
    currentLevel: number,
    currentExp: number,
    gainedExp: number,
    maxLevel: number,
  ): LevelUpResult {
    let level = currentLevel;
    let exp = currentExp + gainedExp;
    let levelsGained = 0;

    if (level >= maxLevel) {
      return {
        newLevel: maxLevel,
        newExp: 0,
        levelsGained: 0,
        isMaxLevel: true,
        expToNextLevel: 0,
      };
    }

    while (level < maxLevel) {
      const required = this.getExpForNextLevel(level);
      if (exp >= required) {
        exp -= required;
        level += 1;
        levelsGained += 1;
      } else {
        break;
      }
    }

    // Cap at max level if reached
    if (level >= maxLevel) {
      level = maxLevel;
      exp = 0;
    }

    return {
      newLevel: level,
      newExp: exp,
      levelsGained,
      isMaxLevel: level >= maxLevel,
      expToNextLevel: level >= maxLevel ? 0 : this.getExpForNextLevel(level) - exp,
    };
  }

  /**
   * Computes stat scaling based on card level.
   * Each level beyond Level 1 grants +2% to HP, ATK, DEF, and SPD.
   */
  calculateScaledStats(baseStats: CardPrimaryStats, level: number): CardPrimaryStats {
    const levelBonus = 1 + (Math.max(1, level) - 1) * 0.02;

    return {
      hp: Math.round(baseStats.hp * levelBonus),
      attack: Math.round(baseStats.attack * levelBonus),
      defense: Math.round(baseStats.defense * levelBonus),
      speed: Math.round(baseStats.speed * levelBonus),
      critRate: baseStats.critRate,
      mp: baseStats.mp,
    };
  }
}
