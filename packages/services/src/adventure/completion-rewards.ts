import { CANONICAL_ITEMS } from '../waifu-tcg/equipment/catalog.js';
import type {
  ActiveAdventureSession,
  AdventureCardSnapshot,
  AdventureEffects,
  AdventureOutcome,
  AdventureOutcomeType,
  AdventureRewardEconomy,
  AdventureScenario,
  AdventureTransition,
} from './types.js';
import { rankAmount, rankChance, safeRewardInteger } from './reward-rank.js';

/** Repeat floor 34 means; rank E is the level-18 comparison, with a 10% advantage. */
export const ADVENTURE_TOWER_BENCHMARK = {
  floor: 34,
  energy: 20,
  credits: 875,
  xp: 175,
  dust: 70.5,
  companionXp: 890,
  advantage: 1.1,
  rankMultiplier: 1.5,
} as const;
export const COMPLETION_WEIGHT: Record<AdventureOutcomeType, number> = {
  CRITICAL_SUCCESS: 1.3,
  SUCCESS: 1.15,
  MIXED: 1,
  FAILURE: 0.7,
  CRITICAL_FAILURE: 0.55,
};
export const offeringValue = (code: string): number =>
  CANONICAL_ITEMS.find((i) => i.code === code)?.shopPrice ?? 0;
/** Every completed story has a card opportunity; authored guaranteed/rarer cards stay intact. */
export function completionEffects(
  session: ActiveAdventureSession,
  outcome: AdventureOutcome,
): AdventureOutcome {
  if (!session.rewardEconomy || session.rewards.cards.length) return outcome;
  const chance = outcome.type.includes('SUCCESS') ? 0.2 : outcome.type === 'MIXED' ? 0.15 : 0.1;
  const existing = outcome.rewards?.card;
  return {
    ...outcome,
    rewards: {
      ...outcome.rewards,
      card: existing
        ? { ...existing, chance: Math.max(existing.chance, chance) }
        : {
            chance:
              outcome.rewards?.rankScaling === 'none'
                ? rankChance(chance, session.rewardRank)
                : chance,
            minRarity: outcome.type.includes('FAILURE') ? 'UNCOMMON' : 'RARE',
          },
    },
  };
}
export function transitionProbabilities(
  t: AdventureTransition,
  card: AdventureCardSnapshot | null,
): Array<[string, number]> {
  if (t.type === 'direct') return [[t.target, 1]];
  const chance =
    t.type === 'element'
      ? Number(card?.element === t.element)
      : t.type === 'stat'
        ? Number(card !== null && card[t.stat] >= t.minimum)
        : Math.max(
            0,
            Math.min(
              1,
              t.chance + (t.element && t.element === card?.element ? (t.elementBonus ?? 0.25) : 0),
            ),
          );
  return [
    [t.success, chance],
    [t.failure, 1 - chance],
  ].filter(([, p]) => p !== 0) as Array<[string, number]>;
}
type Route = {
  credits: number;
  xp: number;
  dust: number;
  fixedCredits: number;
  fixedXp: number;
  fixedDust: number;
  costs: number;
  drain: number;
  restore: number;
};
const emptyRoute = (): Route => ({
  credits: 0,
  xp: 0,
  dust: 0,
  fixedCredits: 0,
  fixedXp: 0,
  fixedDust: 0,
  costs: 0,
  drain: 0,
  restore: 0,
});
function addEffects(route: Route, effect?: AdventureEffects): void {
  const r = effect?.rewards,
    p = effect?.penalties;
  const mean = (range?: { min: number; max: number }) => (range ? (range.min + range.max) / 2 : 0);
  if (r?.rankScaling === 'none') {
    route.fixedCredits += mean(r.credits);
    route.fixedXp += r.xp ?? 0;
    route.fixedDust += r.dust ?? 0;
  } else {
    route.credits += mean(r?.credits);
    route.xp += r?.xp ?? 0;
    route.dust += r?.dust ?? 0;
  }
  route.costs += mean(p?.credits);
  route.drain += p?.energy ?? 0;
  route.restore += r?.energy ?? 0;
}

/** Exact weighted traversal, all choices equally likely and affordable; includes failed checks. */
export function createRewardEconomy(
  scenario: AdventureScenario,
  card: AdventureCardSnapshot | null,
  energyEnabled: boolean,
): AdventureRewardEconomy {
  const sums = {
    energy: 0,
    costs: 0,
    creditsShape: 0,
    xpShape: 0,
    dustShape: 0,
    companionShape: 0,
    fixedCredits: 0,
    fixedXp: 0,
    fixedDust: 0,
  };
  function walk(id: string, probability: number, route: Route, excludeTerminal = false): void {
    const node = scenario.nodes[id]!;
    if (node.type === 'terminal') {
      addEffects(
        route,
        excludeTerminal
          ? { ...node.outcome, rewards: { ...node.outcome.rewards, rankScaling: 'none' } }
          : node.outcome,
      );
      const weight = COMPLETION_WEIGHT[node.outcome.type];
      // New completion policy caps energy restoration at seven to avoid free repeat farming.
      const energy = energyEnabled
        ? 15 + Math.min(85, route.drain) - Math.min(7, route.restore)
        : 15;
      sums.energy += probability * energy;
      sums.costs += probability * route.costs;
      sums.creditsShape += probability * (weight + route.credits / 300);
      sums.xpShape += probability * (weight + route.xp / 100);
      sums.dustShape += probability * (weight + route.dust / 50);
      sums.companionShape += probability * (weight + route.xp / 100);
      sums.fixedCredits += probability * route.fixedCredits;
      sums.fixedXp += probability * route.fixedXp;
      sums.fixedDust += probability * route.fixedDust;
      return;
    }
    for (const choice of node.choices) {
      const next = { ...route };
      next.costs +=
        (choice.cost?.credits ?? 0) +
        (choice.cost?.items ?? []).reduce(
          (total, i) => total + offeringValue(i.code) * i.quantity,
          0,
        );
      addEffects(next, choice.effects);
      for (const [target, chance] of transitionProbabilities(choice.transition, card))
        walk(
          target,
          (probability / node.choices.length) * chance,
          { ...next },
          choice.terminalRankScaling === 'none',
        );
    }
  }
  walk(scenario.rootNodeId, 1, emptyRoute());
  const b = ADVENTURE_TOWER_BENCHMARK;
  const target = (value: number) => (value / b.energy) * sums.energy * b.advantage;
  return {
    version: 2,
    expectedEnergy: sums.energy,
    expectedCosts: sums.costs,
    creditsPerShape: Math.max(
      0,
      (target(b.credits) + sums.costs - sums.fixedCredits) / b.rankMultiplier / sums.creditsShape,
    ),
    xpPerShape: Math.max(0, (target(b.xp) - sums.fixedXp) / b.rankMultiplier / sums.xpShape),
    dustPerShape: Math.max(
      0,
      (target(b.dust) - sums.fixedDust) / b.rankMultiplier / sums.dustShape,
    ),
    companionXpPerShape: target(b.companionXp) / b.rankMultiplier / sums.companionShape,
  };
}

/** Convert authored rewards into balanced base amounts once, then apply the frozen rank. */
export function balanceCompletionRewards(
  session: ActiveAdventureSession,
  outcome: AdventureOutcomeType,
): void {
  const economy = session.rewardEconomy,
    calc = session.rewardCalculation;
  if (!economy || !calc || calc.finalized) return;
  const weight = COMPLETION_WEIGHT[outcome],
    authoredXp = calc.eligible.xp;
  const amount = (value: number) => {
    if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER)
      throw new Error('Invalid balanced reward');
    return Math.floor(value);
  };
  calc.eligible = {
    credits: String(
      amount(economy.creditsPerShape * (weight + Number(calc.eligible.credits) / 300)),
    ),
    xp: amount(economy.xpPerShape * (weight + authoredXp / 100)),
    dust: amount(economy.dustPerShape * (weight + calc.eligible.dust / 50)),
  };
  session.rewards.companionXp = session.card?.userCardId
    ? safeRewardInteger(
        rankAmount(
          BigInt(amount(economy.companionXpPerShape * (weight + authoredXp / 100))),
          session.rewardRank!.amountBps,
        ),
      )
    : 0;
  if (session.admissionMode === 'ENERGY')
    session.rewards.energy = Math.min(7, session.rewards.energy);
}
