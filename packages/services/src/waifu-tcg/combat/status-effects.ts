import type { ActiveStatusEffect, Combatant, StatusEffectType } from './types.js';

/**
 * Constants for elemental status effects matching docs/waifu-tcg.md Section 4.2
 */
export const BURN_DOT_PERCENT = 0.1; // 10% ATK DoT per turn
export const CHILL_SPEED_REDUCTION = 0.25; // -25% SPD
export const FREEZE_SKIP_CHANCE = 0.15; // 15% chance to skip turn while chilled/frozen
export const SURGE_CRIT_BONUS = 0.15; // +15% CRIT chance
export const PURIFY_FLOW_HEAL_PERCENT = 0.08; // 8% max HP per turn
export const RADIANCE_ATK_BONUS = 0.15; // +15% ATK
export const DECAY_LEECH_PERCENT = 0.2; // 20% lifesteal

/**
 * Applies a status effect to a combatant, refreshing duration or adding if new.
 */
export function applyStatusEffect(target: Combatant, effect: ActiveStatusEffect): void {
  const existing = target.statusEffects.find((e) => e.type === effect.type);
  if (existing) {
    existing.duration = Math.max(existing.duration, effect.duration);
    if (effect.value !== undefined) {
      existing.value = Math.max(existing.value ?? 0, effect.value);
    }
  } else {
    target.statusEffects.push({ ...effect });
  }
}

/**
 * Checks if a combatant has an active status effect of a specific type.
 */
export function hasStatusEffect(combatant: Combatant, type: StatusEffectType): boolean {
  return combatant.statusEffects.some((e) => e.type === type && e.duration > 0);
}

/**
 * Removes a specific status effect.
 */
export function removeStatusEffect(combatant: Combatant, type: StatusEffectType): void {
  combatant.statusEffects = combatant.statusEffects.filter((e) => e.type !== type);
}

/**
 * Calculates modified stats considering active buffs/debuffs.
 */
export function calculateEffectiveStats(combatant: Combatant): {
  effectiveAttack: number;
  effectiveDefense: number;
  effectiveSpeed: number;
  effectiveCritRate: number;
  piercesShield: boolean;
} {
  let attackMult = 1.0;
  let defMult = 1.0;
  let spdMult = 1.0;
  let critRate = combatant.critRate;
  let piercesShield = false;

  for (const effect of combatant.statusEffects) {
    if (effect.duration <= 0) continue;

    switch (effect.type) {
      case 'CHILL':
        spdMult -= CHILL_SPEED_REDUCTION;
        break;
      case 'SURGE':
        critRate += SURGE_CRIT_BONUS;
        break;
      case 'FORTIFY':
        defMult += 0.2; // +20% DEF mitigation
        break;
      case 'RADIANCE':
        attackMult += RADIANCE_ATK_BONUS;
        piercesShield = true; // Radiance pierces defense shields
        break;
      default:
        break;
    }
  }

  return {
    effectiveAttack: Math.max(1, Math.round(combatant.attack * attackMult)),
    effectiveDefense: Math.max(1, Math.round(combatant.defense * defMult)),
    effectiveSpeed: Math.max(1, Math.round(combatant.speed * Math.max(0.2, spdMult))),
    effectiveCritRate: Math.min(1.0, Math.max(0.0, critRate)),
    piercesShield,
  };
}

/**
 * Processes start-of-turn status effect ticks:
 * - Burn: Deals 10% ATK damage.
 * - Purify & Flow: Restores 8% max HP and cleanses/reduces debuffs.
 * - Freeze: Evaluates 15% turn-skip chance.
 * - Tick down durations for all active effects.
 */
export function processStartOfTurnStatusEffects(
  combatant: Combatant,
  rng: () => number,
): {
  canAct: boolean;
  logs: string[];
  dotDamage: number;
  healingDone: number;
} {
  const logs: string[] = [];
  let dotDamage = 0;
  let healingDone = 0;
  let canAct = true;

  // 1. Check Purify & Flow (Water)
  if (hasStatusEffect(combatant, 'PURIFY_FLOW')) {
    const heal = Math.round(combatant.maxHealth * PURIFY_FLOW_HEAL_PERCENT);
    const prevHp = combatant.currentHealth;
    combatant.currentHealth = Math.min(combatant.maxHealth, combatant.currentHealth + heal);
    healingDone += combatant.currentHealth - prevHp;
    logs.push(
      `💧 **Purify & Flow** restored **${combatant.currentHealth - prevHp} HP** (${combatant.currentHealth}/${combatant.maxHealth} HP).`,
    );

    // Reduce duration of all harmful debuffs by 1 extra turn
    for (const eff of combatant.statusEffects) {
      if (['BURN', 'FREEZE', 'CHILL'].includes(eff.type)) {
        eff.duration = Math.max(0, eff.duration - 1);
        logs.push(`💧 **Purify & Flow** cleansed 1 turn of **${eff.type}**.`);
      }
    }
  }

  // 2. Check Burn (Fire)
  const burnEffect = combatant.statusEffects.find((e) => e.type === 'BURN' && e.duration > 0);
  if (burnEffect) {
    // 10% of attacker's ATK or target's base ATK as default
    const burnDmg =
      burnEffect.value ?? Math.max(20, Math.round(combatant.attack * BURN_DOT_PERCENT));
    dotDamage += burnDmg;
    combatant.currentHealth = Math.max(0, combatant.currentHealth - burnDmg);
    if (combatant.currentHealth === 0) {
      combatant.isAlive = false;
    }
    logs.push(
      `🔥 **Burn** seared **${combatant.name}** for **${burnDmg} DoT damage** (${combatant.currentHealth}/${combatant.maxHealth} HP remaining).`,
    );
  }

  // 3. Check Freeze (Ice)
  const isFrozen = hasStatusEffect(combatant, 'FREEZE');
  const isChilled = hasStatusEffect(combatant, 'CHILL');
  if (isFrozen || isChilled) {
    const roll = rng();
    if (isFrozen || roll < FREEZE_SKIP_CHANCE) {
      canAct = false;
      logs.push(
        `❄️ **Freeze** encrusted **${combatant.name}** in solid ice! Combat action skipped this turn!`,
      );
    }
  }

  // 4. Tick down durations
  for (const eff of combatant.statusEffects) {
    eff.duration -= 1;
  }
  combatant.statusEffects = combatant.statusEffects.filter((e) => e.duration > 0);

  return { canAct, logs, dotDamage, healingDone };
}

/**
 * Processes Shadow Decay & Leech: converts 20% of damage dealt into health recovery.
 */
export function processLeech(attacker: Combatant, damageDealt: number): number {
  if (!hasStatusEffect(attacker, 'DECAY_LEECH') && attacker.element !== 'SHADOW') {
    return 0;
  }
  const leechAmount = Math.round(damageDealt * DECAY_LEECH_PERCENT);
  if (leechAmount <= 0) return 0;

  const prevHp = attacker.currentHealth;
  attacker.currentHealth = Math.min(attacker.maxHealth, attacker.currentHealth + leechAmount);
  return attacker.currentHealth - prevHp;
}
