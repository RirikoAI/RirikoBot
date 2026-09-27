/** Reproducible comparison using the actual completion reward pipeline; no database changes. */
import { writeFileSync } from 'node:fs';
import {
  ADVENTURE_SCENARIOS,
  ADVENTURE_REWARD_RANKS,
} from '../packages/services/src/adventure/index.js';
import { simulateAdventureRewards } from '../packages/services/src/adventure/balance-simulation.js';
import { ADVENTURE_TOWER_BENCHMARK } from '../packages/services/src/adventure/completion-rewards.js';
const rows = [];
for (const scenario of ADVENTURE_SCENARIOS) {
  for (const rank of ADVENTURE_REWARD_RANKS) {
    const card = {
      userCardId: 'reference',
      level: rank.rank === 'E' ? 18 : rank.level,
      name: 'Reference companion',
      element: 'WATER' as const,
      attack: 150,
      defense: 150,
      speed: 150,
    };
    rows.push(simulateAdventureRewards(scenario, card));
    if (rank.rank === 'E') rows.push(simulateAdventureRewards(scenario, card, 10_000, true));
  }
}
const assumptions =
  'Rank E / level 18 targets 10% above repeat floor 34 at 20 energy. 10,000 seeded runs per scenario/rank, fixed WATER companion with 150 ATK/DEF/SPD and sufficient currency/offering items. Standard policy chooses uniformly among all buttons, including paid and losing routes. Free-only E rows show choice-policy sensitivity; they do not set the target. Net credits subtract paid credits, losses and item offerings at canonical shop prices. Energy is actual modeled entry plus drain minus restoration (new cap 7), assuming 100 initial energy and no concurrent energy changes. Loot counts are successful card intents with available definitions; companion XP is the grant budget before rarity-cap clipping. Higher ranks intentionally retain the requested multipliers, rather than remaining only 10% ahead of floor 34. Solo runs grant no companion XP. These estimates are not guaranteed payouts or optimal-route claims.';
writeFileSync(
  'docs/adventure-reward-balance.json',
  JSON.stringify(
    {
      economyVersion: 2,
      rankPolicyVersion: 1,
      seed: 1715,
      samplesPerRow: 10_000,
      benchmark: ADVENTURE_TOWER_BENCHMARK,
      assumptions,
      rows,
    },
    null,
    2,
  ) + '\n',
);
let md =
  '# Adventure progression balance comparison\n\nRegenerate with `node --import tsx scripts/adventure-reward-balance.ts`. ' +
  assumptions +
  '\n\n[Full rank and sensitivity figures](adventure-reward-balance.json). No solution routes are included.\n\n| Adventure | Net credits | Player XP | Dust | Companion XP budget | Net energy | Card chance* | Credit advantage | Free-only net credits |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n';
for (const scenario of ADVENTURE_SCENARIOS) {
  const r = rows.find((r) => r.scenario === scenario.id && r.rank === 'E' && !r.freeOnly)!,
    free = rows.find((r) => r.scenario === scenario.id && r.freeOnly)!;
  md +=
    '| ' +
    scenario.title +
    ' | ' +
    [r.mean.credits, r.mean.xp, r.mean.dust, r.mean.companionXp, r.mean.energy]
      .map((n) => n.toFixed(1))
      .join(' | ') +
    ' | ' +
    (r.mean.cards * 100).toFixed(1) +
    '% | ' +
    ((r.perEnergy.credits / (875 / 20) - 1) * 100).toFixed(1) +
    '% | ' +
    free.mean.credits.toFixed(1) +
    ' |\n';
}
md +=
  '\n*Mean cards per run, including authored guaranteed cards; this is not a rarity-upgrade chance. Ordinary progression is calibrated independently of card/item value. Failures still have reduced completion rewards, while decisions retain their authored bonuses, losses and loot. Authored fixed wager components remain fixed; every finished run also receives its calibrated completion rewards.\n';
writeFileSync('docs/adventure-reward-balance.md', md);
console.log('Wrote ' + rows.length + ' comparisons from ' + rows.length * 10_000 + ' seeded runs.');
