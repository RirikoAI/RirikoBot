import type { CombatElement } from './types.js';

export const ELEMENTAL_ADVANTAGE_MULTIPLIER = 1.5;
export const ELEMENTAL_DISADVANTAGE_MULTIPLIER = 0.75;
export const ELEMENTAL_NEUTRAL_MULTIPLIER = 1.0;

/**
 * Advantage loop map: Attacker -> Element it is strong against (1.5x damage)
 * Section 4.1:
 * - Fire melts Ice (Fire > Ice)
 * - Ice freezes & fractures Earth (Ice > Earth)
 * - Earth grounds & absorbs Lightning (Earth > Lightning)
 * - Lightning electrifies & shocks Water (Lightning > Water)
 * - Water extinguishes Fire (Water > Fire)
 * - Light and Shadow inflict mutual catastrophic bonus damage on each other (Light <> Shadow)
 */
const ADVANTAGE_MAP: Record<CombatElement, CombatElement[]> = {
  FIRE: ['ICE'],
  ICE: ['EARTH'],
  EARTH: ['LIGHTNING'],
  LIGHTNING: ['WATER'],
  WATER: ['FIRE'],
  LIGHT: ['SHADOW'],
  SHADOW: ['LIGHT'],
};

/**
 * Returns whether attacker has ADVANTAGE, DISADVANTAGE, or NEUTRAL against defender.
 */
export function getElementalAdvantage(
  attacker: CombatElement,
  defender: CombatElement,
): 'ADVANTAGE' | 'DISADVANTAGE' | 'NEUTRAL' {
  if (ADVANTAGE_MAP[attacker]?.includes(defender)) {
    return 'ADVANTAGE';
  }
  if (ADVANTAGE_MAP[defender]?.includes(attacker)) {
    return 'DISADVANTAGE';
  }
  return 'NEUTRAL';
}

/**
 * Calculates the exact damage multiplier based on elemental affinities.
 * - ADVANTAGE: 1.5x
 * - DISADVANTAGE: 0.75x
 * - NEUTRAL: 1.0x
 */
export function getElementalMultiplier(attacker: CombatElement, defender: CombatElement): number {
  const advantage = getElementalAdvantage(attacker, defender);
  switch (advantage) {
    case 'ADVANTAGE':
      return ELEMENTAL_ADVANTAGE_MULTIPLIER;
    case 'DISADVANTAGE':
      return ELEMENTAL_DISADVANTAGE_MULTIPLIER;
    case 'NEUTRAL':
    default:
      return ELEMENTAL_NEUTRAL_MULTIPLIER;
  }
}

/**
 * Returns a human-readable description of the elemental interaction.
 */
export function getElementAdvantageDescription(
  attacker: CombatElement,
  defender: CombatElement,
): string {
  if (attacker === 'LIGHT' && defender === 'SHADOW') {
    return 'Mutual Catastrophe: Light and Shadow inflict 1.5x bonus damage on each other!';
  }
  if (attacker === 'SHADOW' && defender === 'LIGHT') {
    return 'Mutual Catastrophe: Shadow and Light inflict 1.5x bonus damage on each other!';
  }
  if (attacker === 'FIRE' && defender === 'ICE') {
    return 'Thermal Melt: Fire melts Ice for 1.5x bonus damage!';
  }
  if (attacker === 'ICE' && defender === 'EARTH') {
    return 'Glacial Fracture: Ice freezes & fractures Earth for 1.5x bonus damage!';
  }
  if (attacker === 'EARTH' && defender === 'LIGHTNING') {
    return 'Ground Dissipation: Earth grounds & absorbs Lightning for 1.5x bonus damage!';
  }
  if (attacker === 'LIGHTNING' && defender === 'WATER') {
    return 'Hydro Electrocution: Lightning shocks Water for 1.5x bonus damage!';
  }
  if (attacker === 'WATER' && defender === 'FIRE') {
    return 'Extinguish Torrent: Water extinguishes Fire for 1.5x bonus damage!';
  }

  const advantage = getElementalAdvantage(attacker, defender);
  if (advantage === 'DISADVANTAGE') {
    return `Disadvantaged Affinity: ${attacker} deals reduced (0.75x) damage against ${defender}.`;
  }
  return `Neutral Affinity: ${attacker} vs ${defender} (1.0x standard damage).`;
}
