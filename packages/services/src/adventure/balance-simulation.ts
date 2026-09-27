import type { ActiveAdventureSession, AdventureCardSnapshot, AdventureScenario } from './types.js';
import { adventureRewardRank, finalizeRankRewards, newRewardCalculation } from './reward-rank.js';
import {
  balanceCompletionRewards,
  completionEffects,
  createRewardEconomy,
  offeringValue,
  transitionProbabilities,
} from './completion-rewards.js';
import { accumulateAdventureEffects } from './reward-effects.js';
import { createMulberry32 } from '../waifu-tcg/rarity/rarity-engine.js';

/** Uses live accumulation/finalization with a deterministic, uniformly choosing reference player. */
export function simulateAdventureRewards(
  scenario: AdventureScenario,
  card: AdventureCardSnapshot,
  samples = 10_000,
  freeOnly = false,
) {
  const rank = adventureRewardRank(card.level!),
    economy = createRewardEconomy(scenario, card, true);
  const sums = {
    credits: 0,
    xp: 0,
    dust: 0,
    companionXp: 0,
    cards: 0,
    energy: 0,
    paidCredits: 0,
    offeringCredits: 0,
    losses: 0,
    failedRuns: 0,
  };
  for (let i = 0; i < samples; i++) {
    const rng = createMulberry32(1715 + i);
    const state: ActiveAdventureSession = {
      id: 'simulation',
      userId: 'simulation',
      guildId: 'simulation',
      channelId: 'simulation',
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      currentNodeId: scenario.rootNodeId,
      revision: 0,
      status: 'ACTIVE',
      rngState: 0,
      entryEnergyCharged: 15,
      startedAt: 0,
      deadline: 0,
      presented: true,
      messageId: null,
      deliveredRevision: 0,
      history: [],
      receipt: null,
      card,
      admissionMode: 'ENERGY',
      rewardRank: rank,
      rewardEconomy: economy,
      rewardCalculation: newRewardCalculation(),
      rewards: { credits: '0', xp: 0, dust: 0, energy: 0, items: [], cards: [] },
      penalties: { credits: '0', energy: 0 },
    };
    let paid = 0,
      offerings = 0,
      node = scenario.nodes[scenario.rootNodeId]!;
    while (node.type === 'decision') {
      const choices = freeOnly ? node.choices.filter((c) => !c.cost) : node.choices;
      const choice = choices[Math.floor(rng() * choices.length)]!;
      paid += choice.cost?.credits ?? 0;
      offerings += (choice.cost?.items ?? []).reduce(
        (n, item) => n + offeringValue(item.code) * item.quantity,
        0,
      );
      const branches = transitionProbabilities(choice.transition, card);
      // Preserve transition RNG consumption: skill checks always consume one draw.
      let target = branches[0]![0];
      if (choice.transition.type === 'skill') {
        const t = choice.transition;
        const chance = Math.max(
          0,
          Math.min(
            1,
            t.chance + (t.element && t.element === card.element ? (t.elementBonus ?? 0.25) : 0),
          ),
        );
        target = rng() < chance ? t.success : t.failure;
      }
      accumulateAdventureEffects(state, choice.effects, rng);
      node = scenario.nodes[target]!;
      if (node.type === 'terminal') {
        const outcome = choice.terminalRankScaling
          ? {
              ...node.outcome,
              rewards: { ...node.outcome.rewards, rankScaling: choice.terminalRankScaling },
            }
          : node.outcome;
        accumulateAdventureEffects(state, completionEffects(state, outcome), rng);
      }
    }
    balanceCompletionRewards(state, node.outcome.type);
    finalizeRankRewards(state);
    const losses = Math.min(Number(state.penalties.credits), 10_000 - paid);
    sums.credits += Number(state.rewards.credits) - paid - losses - offerings;
    sums.xp += state.rewards.xp;
    sums.dust += state.rewards.dust;
    sums.companionXp += state.rewards.companionXp ?? 0;
    sums.cards += state.rewards.cards.length;
    sums.energy += 15 + Math.min(85, state.penalties.energy) - state.rewards.energy;
    sums.paidCredits += paid;
    sums.offeringCredits += offerings;
    sums.losses += losses;
    sums.failedRuns += Number(node.outcome.type.includes('FAILURE'));
  }
  return {
    scenario: scenario.id,
    rank: rank.rank,
    samples,
    freeOnly,
    mean: Object.fromEntries(Object.entries(sums).map(([k, n]) => [k, n / samples])) as typeof sums,
    perEnergy: {
      credits: sums.credits / sums.energy,
      xp: sums.xp / sums.energy,
      dust: sums.dust / sums.energy,
      companionXp: sums.companionXp / sums.energy,
    },
  };
}
