import type { Combatant } from './types.js';
import { applyStatusEffect } from './status-effects.js';

export const SHARPENED_EDGE_BONUS = 0.08; // +8% DMG against armored targets
export const VAMPIRIC_TOUCH_HEAL_PERCENT = 0.12; // 12% lifesteal
export const GLACIAL_COUNTER_CHANCE = 0.25; // 25% chance to freeze attacker
export const MANA_CONDUIT_BONUS_START_MP = 25; // +25 starting MP
export const MANA_CONDUIT_COST_REDUCTION = 0.25; // -25% skill MP cost
export const PHOENIX_WARD_REVIVE_HP_PERCENT = 0.35; // 35% HP revive
export const COSMIC_CATACLYSM_ATK_MULTIPLIER = 2.0; // 200% ATK true damage

/**
 * Applies passive perks at the beginning of combat (e.g. Mana Conduit starting MP).
 */
export function applyBattleStartPerks(combatants: Combatant[]): string[] {
  const logs: string[] = [];
  for (const c of combatants) {
    if (c.perks.includes('MANA_CONDUIT')) {
      c.currentMp = Math.min(c.maxMp, c.currentMp + MANA_CONDUIT_BONUS_START_MP);
      c.skillManaCost = Math.round(c.skillManaCost * (1 - MANA_CONDUIT_COST_REDUCTION));
      logs.push(`🔮 **Mana Conduit** activated for **${c.name}** (+25 Start MP, -25% Skill Cost)!`);
    }
  }
  return logs;
}

/**
 * Applies perks when an attacker executes an offensive action.
 */
export function applyAttackPerks(
  attacker: Combatant,
  defender: Combatant,
  rawDamage: number,
): { modifiedDamage: number; vampiricHeal: number; logs: string[] } {
  let damage = rawDamage;
  let vampiricHeal = 0;
  const logs: string[] = [];

  // Sharpened Edge: +8% Physical DMG against armored foes (DEF >= 100)
  if (attacker.perks.includes('SHARPENED_EDGE') && defender.defense >= 100) {
    const bonus = Math.round(damage * SHARPENED_EDGE_BONUS);
    damage += bonus;
    logs.push(`🗡️ **Sharpened Edge** punctured **${defender.name}**'s armor (+${bonus} DMG)!`);
  }

  // Vampiric Touch: Convert 12% of physical damage dealt into HP healing
  if (attacker.perks.includes('VAMPIRIC_TOUCH')) {
    const heal = Math.round(damage * VAMPIRIC_TOUCH_HEAL_PERCENT);
    if (heal > 0) {
      const prev = attacker.currentHealth;
      attacker.currentHealth = Math.min(attacker.maxHealth, attacker.currentHealth + heal);
      vampiricHeal = attacker.currentHealth - prev;
      logs.push(`🩸 **Vampiric Touch** siphoned **${vampiricHeal} HP** for **${attacker.name}**!`);
    }
  }

  return { modifiedDamage: damage, vampiricHeal, logs };
}

/**
 * Applies defensive counter perks when a defender is attacked.
 */
export function applyDefendPerks(
  defender: Combatant,
  attacker: Combatant,
  rng: () => number,
): { frozeAttacker: boolean; logs: string[] } {
  let frozeAttacker = false;
  const logs: string[] = [];

  if (defender.perks.includes('GLACIAL_COUNTER')) {
    const roll = rng();
    if (roll < GLACIAL_COUNTER_CHANCE) {
      frozeAttacker = true;
      applyStatusEffect(attacker, {
        type: 'FREEZE',
        duration: 1,
        sourceElement: 'ICE',
      });
      logs.push(
        `❄️ **Glacial Counter** shattered across **${attacker.name}**, freezing them for 1 turn!`,
      );
    }
  }

  return { frozeAttacker, logs };
}

/**
 * Checks and resolves Phoenix Ward upon fatal damage.
 */
export function checkPhoenixWard(combatant: Combatant): { revived: boolean; logs: string[] } {
  if (
    combatant.currentHealth <= 0 &&
    combatant.perks.includes('PHOENIX_WARD') &&
    !combatant.hasUsedPhoenixWard
  ) {
    combatant.hasUsedPhoenixWard = true;
    combatant.currentHealth = Math.round(combatant.maxHealth * PHOENIX_WARD_REVIVE_HP_PERCENT);
    combatant.isAlive = true;
    return {
      revived: true,
      logs: [
        `🔥 **Phoenix Ward** burst in celestial flames! **${combatant.name}** rose from ashes with **${combatant.currentHealth} HP** (35%)!`,
      ],
    };
  }
  return { revived: false, logs: [] };
}

/**
 * Evaluates periodic/turn-based battle perks like Cosmic Cataclysm.
 */
export function applyPeriodicPerks(
  combatant: Combatant,
  opponents: Combatant[],
  turn: number,
): { triggeredCataclysm: boolean; target?: Combatant; trueDamage: number; logs: string[] } {
  const logs: string[] = [];

  if (combatant.perks.includes('COSMIC_CATACLYSM') && turn > 0 && turn % 3 === 0) {
    const aliveOpponents = opponents.filter((o) => o.isAlive);
    if (aliveOpponents.length > 0) {
      const target = aliveOpponents[0]!;
      const trueDamage = Math.round(combatant.attack * COSMIC_CATACLYSM_ATK_MULTIPLIER);
      target.currentHealth = Math.max(0, target.currentHealth - trueDamage);
      if (target.currentHealth === 0) {
        target.isAlive = false;
      }
      logs.push(
        `🌌 **Cosmic Cataclysm** erupted from **${combatant.name}**! Unleashed **${trueDamage} true damage** upon **${target.name}** (ignoring DEF and shields)!`,
      );
      return { triggeredCataclysm: true, target, trueDamage, logs };
    }
  }

  return { triggeredCataclysm: false, trueDamage: 0, logs: [] };
}
