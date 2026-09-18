import type { CardRarity, CardElement } from '../types.js';

export type CombatElement = CardElement;

export type StatusEffectType =
  | 'BURN'
  | 'FREEZE'
  | 'CHILL'
  | 'FORTIFY'
  | 'SURGE'
  | 'PURIFY_FLOW'
  | 'RADIANCE'
  | 'DECAY_LEECH';

export type BattlePerkType =
  | 'SHARPENED_EDGE'
  | 'VAMPIRIC_TOUCH'
  | 'GLACIAL_COUNTER'
  | 'MANA_CONDUIT'
  | 'PHOENIX_WARD'
  | 'COSMIC_CATACLYSM';

export interface ActiveStatusEffect {
  type: StatusEffectType;
  duration: number; // turns remaining
  value?: number | undefined;
  sourceElement?: CombatElement | undefined;
}

export interface Combatant {
  id: string;
  name: string;
  team: 'TEAM_A' | 'TEAM_B';
  element: CombatElement;
  rarity: CardRarity;
  level: number;
  maxHealth: number;
  currentHealth: number;
  attack: number;
  defense: number;
  speed: number;
  critRate: number;
  critDamage: number;
  maxMp: number;
  currentMp: number;
  skillName?: string | undefined;
  skillDescription?: string | undefined;
  skillManaCost: number;
  passiveName?: string | undefined;
  passiveDescription?: string | undefined;
  shield: number;
  statusEffects: ActiveStatusEffect[];
  perks: BattlePerkType[];
  hasUsedPhoenixWard: boolean;
  isAlive: boolean;
}

export type ActionType =
  | 'ATTACK'
  | 'SKILL'
  | 'POTION'
  | 'PERK'
  | 'STATUS_TICK'
  | 'REVIVE'
  | 'ENRAGE';

export interface CombatActionLog {
  turn: number;
  actorId: string;
  actorName: string;
  actionType: ActionType;
  targetId?: string | undefined;
  targetName?: string | undefined;
  damageDealt?: number | undefined;
  healingDone?: number | undefined;
  shieldApplied?: number | undefined;
  isCritical?: boolean | undefined;
  elementMultiplier?: number | undefined;
  message: string;
}

export interface CombatResult {
  winner: 'TEAM_A' | 'TEAM_B' | 'DRAW';
  turnsTotal: number;
  logs: CombatActionLog[];
  teamA: Combatant[];
  teamB: Combatant[];
}
