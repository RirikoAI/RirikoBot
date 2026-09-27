import { describe, it, expect } from 'vitest';
import { ADVENTURE_SCENARIOS } from '../scenarios/index.js';
import { simulateAdventureRewards } from '../balance-simulation.js';
import { ADVENTURE_TOWER_BENCHMARK, createRewardEconomy } from '../completion-rewards.js';
import type { AdventureCardSnapshot } from '../types.js';
const companion: AdventureCardSnapshot = {
  userCardId: 'owned',
  level: 18,
  name: 'Companion',
  element: 'WATER',
  attack: 150,
  defense: 150,
  speed: 150,
};
describe('tower-benchmarked completion rewards', () => {
  it.each(ADVENTURE_SCENARIOS)(
    '$id pays about 10% above floor 34 per energy including failed/paid routes',
    (scenario) => {
      const result = simulateAdventureRewards(scenario, companion);
      for (const key of ['credits', 'xp', 'dust', 'companionXp'] as const) {
        const ratio = result.perEnergy[key] / (ADVENTURE_TOWER_BENCHMARK[key] / 20);
        expect(ratio, `${scenario.id} ${key}`).toBeGreaterThan(1.06);
        expect(ratio, `${scenario.id} ${key}`).toBeLessThan(1.14);
      }
      expect(result.mean.cards).toBeGreaterThan(0.14);
      expect(result.mean.energy).toBeGreaterThanOrEqual(8);
    },
  );
  it('calibrates to actual companion checks without assuming a successful route', () => {
    const crypt = ADVENTURE_SCENARIOS.find((s) => s.id === 'the-cursed-crypt')!;
    const low = createRewardEconomy(crypt, null, true);
    const high = createRewardEconomy(
      crypt,
      { ...companion, attack: 5000, defense: 5000, speed: 5000, element: 'LIGHT' },
      true,
    );
    expect(low).not.toEqual(high);
    const result = simulateAdventureRewards(crypt, {
      ...companion,
      attack: 5000,
      defense: 5000,
      speed: 5000,
      element: 'LIGHT',
    });
    expect(result.perEnergy.credits / (875 / 20)).toBeGreaterThan(1.06);
    expect(result.perEnergy.credits / (875 / 20)).toBeLessThan(1.14);
  });
});
