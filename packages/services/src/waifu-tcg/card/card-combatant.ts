import type { Combatant } from '../combat/types.js';
import type { CardElement, CardRarity } from '../types.js';
import { resolveSkillMpCost } from './card-generator.js';
import { LevelingEngine } from './leveling-engine.js';

export interface CardCombatantInput {
  id: string;
  name: string;
  element: CardElement;
  rarity: CardRarity;
  level: number;
  /** Level-1 card stats. */
  stats: { hp: number; attack: number; defense: number; speed: number; critRate: number };
  skillName?: string | null | undefined;
  skillDescription?: string | null | undefined;
  passiveName?: string | null | undefined;
  passiveDescription?: string | null | undefined;
}

const levelingEngine = new LevelingEngine();

/**
 * Turns card data into a battle combatant: level-scaled stats, 100 MP, and the skill's real MP
 * cost. Gear is applied separately (applyEquipmentToCombatant).
 */
export function createCardCombatant(
  input: CardCombatantInput,
  team: 'TEAM_A' | 'TEAM_B',
): Combatant {
  const scaled = levelingEngine.calculateScaledStats({ ...input.stats, mp: 100 }, input.level);
  return {
    id: input.id,
    name: `${input.name} (Lv.${input.level})`,
    team,
    element: input.element,
    rarity: input.rarity,
    level: input.level,
    maxHealth: scaled.hp,
    currentHealth: scaled.hp,
    attack: scaled.attack,
    defense: scaled.defense,
    speed: scaled.speed,
    critRate: scaled.critRate,
    critDamage: 1.5,
    maxMp: 100,
    currentMp: 0,
    skillName: input.skillName ?? undefined,
    skillDescription: input.skillDescription ?? undefined,
    skillManaCost: resolveSkillMpCost(input.skillDescription, input.element),
    passiveName: input.passiveName ?? undefined,
    passiveDescription: input.passiveDescription ?? undefined,
    shield: 0,
    statusEffects: [],
    perks: [],
    hasUsedPhoenixWard: false,
    isAlive: true,
  };
}
