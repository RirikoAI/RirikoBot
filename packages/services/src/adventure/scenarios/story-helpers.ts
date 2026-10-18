import type { CardElement } from '../../waifu-tcg/types.js';
import type {
  AdventureChoice,
  AdventureEffects,
  AdventureNode,
  AdventureOutcomeType,
  AdventureRiskTier,
  AdventureScenario,
  AdventureStat,
} from '../types.js';

type Choice = Omit<AdventureChoice, 'id'>;
export const go = (label: string, target: string, effects?: AdventureEffects): Choice => ({
  label,
  transition: { type: 'direct', target },
  ...(effects ? { effects } : {}),
});
export const pay = (label: string, credits: number, target: string): Choice => ({
  ...go(label, target),
  cost: { credits },
});
export const check = (
  label: string,
  element: CardElement,
  chance: number,
  success: string,
  failure: string,
): Choice => ({
  label,
  transition: { type: 'skill', element, chance, elementBonus: 0.25, success, failure },
});
export const stat = (
  label: string,
  stat: AdventureStat,
  minimum: number,
  success: string,
  failure: string,
): Choice => ({ label, transition: { type: 'stat', stat, minimum, success, failure } });
export const decision = (
  id: string,
  stage: number,
  title: string,
  narrative: string,
  choices: Choice[],
): AdventureNode => ({
  type: 'decision',
  id,
  stage,
  title,
  narrative,
  choices: choices.map((choice, i) => ({ ...choice, id: String(i + 1) })),
});
export const ending = (
  id: string,
  title: string,
  narrative: string,
  type: AdventureOutcomeType,
  effects: AdventureEffects,
): AdventureNode => ({ type: 'terminal', id, title, outcome: { type, narrative, ...effects } });
export const reward = (credits: number, xp = 80, dust = 0): AdventureEffects => ({
  rewards: { credits: { min: credits, max: credits }, xp, ...(dust ? { dust } : {}) },
});
const colors: Record<CardElement, number> = {
  FIRE: 0xe67e22,
  ICE: 0x91d8eb,
  EARTH: 0x729b50,
  LIGHTNING: 0xd7b44a,
  WATER: 0x3498db,
  LIGHT: 0xf4d58d,
  SHADOW: 0x8e64b0,
};

/** Only removes declaration boilerplate; every node, choice and consequence is authored. */
export function story(
  id: string,
  title: string,
  description: string,
  element: CardElement,
  risk: AdventureRiskTier,
  nodes: AdventureNode[],
): AdventureScenario {
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length)
    throw new Error(`Duplicate node in ${id}`);
  return {
    id,
    title,
    description,
    version: 1,
    scene: id,
    color: colors[element],
    risk,
    elements: [element],
    totalDecisions: 4,
    energyCost: 15,
    rootNodeId: 'root',
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])),
  };
}
