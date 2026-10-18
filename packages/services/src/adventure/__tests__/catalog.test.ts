import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_SCENARIOS,
  getAdventureScenario,
  pickRandomScenario,
  searchAdventureScenarios,
} from '../scenarios/index.js';
import { adventureTargets, validateAdventureScenario } from '../validate-scenario.js';
import { createMulberry32 } from '../../waifu-tcg/rarity/rarity-engine.js';
import type { AdventureScenario } from '../types.js';

describe('adventure catalog', () => {
  it.each(
    ADVENTURE_SCENARIOS.map((scenario, i) => ({ scenario, paths: [116, 136, 60, 96, 56][i] })),
  )('exhaustively validates $scenario.id', ({ scenario, paths }) => {
    let terminalPaths = 0;
    const walk = (id: string, decisions: number): void => {
      const node = scenario.nodes[id]!;
      if (node.type === 'terminal') {
        expect(decisions).toBe(scenario.totalDecisions);
        terminalPaths++;
        return;
      }
      expect(node.stage).toBe(decisions + 1);
      for (const choice of node.choices)
        for (const target of adventureTargets(choice.transition)) walk(target, decisions + 1);
    };
    validateAdventureScenario(scenario);
    walk(scenario.rootNodeId, 0);
    if (paths !== undefined) expect(terminalPaths).toBe(paths);
    else expect(terminalPaths).toBeGreaterThanOrEqual(16);
  });

  it('samples scenarios deterministically and checks random/lookup boundaries', () => {
    const a = createMulberry32(1701),
      b = createMulberry32(1701);
    expect(Array.from({ length: 20 }, () => pickRandomScenario(a).id)).toEqual(
      Array.from({ length: 20 }, () => pickRandomScenario(b).id),
    );
    expect(pickRandomScenario(() => 0)).toBe(ADVENTURE_SCENARIOS[0]);
    expect(pickRandomScenario(() => 0.999999)).toBe(ADVENTURE_SCENARIOS.at(-1));
    for (const value of [-1, 1, NaN, Infinity])
      expect(() => pickRandomScenario(() => value)).toThrow();
    expect(getAdventureScenario('the-goblin-bazaar')).toBe(ADVENTURE_SCENARIOS[0]);
    expect(() => getAdventureScenario('the-goblin-bazaar', 99)).toThrow();
    expect(() => getAdventureScenario('missing')).toThrow();
  });

  it('adds thirty distinct illustrated stories and makes every catalog entry searchable', () => {
    expect(ADVENTURE_SCENARIOS).toHaveLength(35);
    expect(new Set(ADVENTURE_SCENARIOS.map((s) => s.id)).size).toBe(35);
    const added = ADVENTURE_SCENARIOS.slice(5);
    expect(new Set(added.map((s) => s.scene)).size).toBe(30);
    expect(new Set(added.map((s) => s.title)).size).toBe(30);
    for (const scenario of ADVENTURE_SCENARIOS) {
      expect(searchAdventureScenarios(scenario.title.toUpperCase()).map((s) => s.id)).toContain(
        scenario.id,
      );
      expect(searchAdventureScenarios(scenario.id).map((s) => s.id)).toContain(scenario.id);
    }
    for (const scenario of added) {
      expect(scenario.totalDecisions).toBe(4);
      expect(scenario.scene).toMatch(/^[a-z0-9-]+$/);
      const terminals = Object.values(scenario.nodes).filter((n) => n.type === 'terminal');
      expect(terminals.length).toBeGreaterThanOrEqual(3);
      expect(new Set(terminals.map((n) => n.outcome.narrative)).size).toBe(terminals.length);
    }
    expect(searchAdventureScenarios('')).toHaveLength(25);
    expect(searchAdventureScenarios('  LIGHTHOUSE  ')[0]?.id).toBe('the-frostbound-lighthouse');
    expect(searchAdventureScenarios('not-an-adventure-xyz')).toEqual([]);
    // Midpoints exercise every bucket without depending on a particular random seed's coverage.
    ADVENTURE_SCENARIOS.forEach((scenario, i) =>
      expect(pickRandomScenario(() => (i + 0.5) / 35)).toBe(scenario),
    );
  });

  const invalidCases: Array<[string, (scenario: AdventureScenario) => void]> = [
    [
      'identical choices with different labels',
      (s) => {
        const node = s.nodes.root!;
        if (node.type === 'decision') {
          const choice = structuredClone(node.choices[2]!);
          node.choices = [
            choice,
            { ...choice, id: 'different', label: 'Acknowledge and continue' },
          ];
        }
      },
    ],
    [
      'early terminal',
      (s) => {
        const n = s.nodes.root!;
        if (n.type === 'decision') n.choices[0]!.transition = { type: 'direct', target: 'clean' };
      },
    ],
    [
      'cycle',
      (s) => {
        const n = s.nodes.root!;
        if (n.type === 'decision') n.choices[0]!.transition = { type: 'direct', target: 'root' };
      },
    ],
    [
      'missing branch',
      (s) => {
        delete s.nodes.market;
      },
    ],
    [
      'unreachable node',
      (s) => {
        s.nodes.orphan = {
          type: 'terminal',
          id: 'orphan',
          title: 'Orphan',
          outcome: { type: 'SUCCESS', narrative: 'Unreachable' },
        };
      },
    ],
    [
      'no free choice',
      (s) => {
        const n = s.nodes.root!;
        if (n.type === 'decision')
          n.choices.forEach((c) => {
            c.cost = { credits: 100 };
          });
      },
    ],
    [
      'duplicate choice ID',
      (s) => {
        const n = s.nodes.root!;
        if (n.type === 'decision') n.choices[1]!.id = n.choices[0]!.id;
      },
    ],
    [
      'invalid probability',
      (s) => {
        const n = s.nodes.root!;
        if (n.type === 'decision')
          n.choices[1]!.transition = {
            type: 'skill',
            chance: NaN,
            success: 'market',
            failure: 'detention',
          };
      },
    ],
    [
      'negative price',
      (s) => {
        const n = s.nodes.root!;
        if (n.type === 'decision') n.choices[0]!.cost = { credits: -1 };
      },
    ],
    [
      'fractional reward',
      (s) => {
        const n = s.nodes.clean!;
        if (n.type === 'terminal') n.outcome.rewards = { xp: 0.5 };
      },
    ],
    [
      'inverted range',
      (s) => {
        const n = s.nodes.clean!;
        if (n.type === 'terminal') n.outcome.rewards = { credits: { min: 2, max: 1 } };
      },
    ],
    [
      'invalid item quantity',
      (s) => {
        const n = s.nodes.clean!;
        if (n.type === 'terminal')
          n.outcome.rewards = { items: [{ code: 'POTION_MINOR_HP', quantity: 0, chance: 1 }] };
      },
    ],
    [
      'empty decision',
      (s) => {
        const n = s.nodes.root!;
        if (n.type === 'decision') n.choices = [];
      },
    ],
  ];
  it.each(invalidCases)('rejects %s before admission', (_name, mutate) => {
    const scenario = structuredClone(ADVENTURE_SCENARIOS[0]!);
    mutate(scenario);
    expect(() => validateAdventureScenario(scenario)).toThrow();
  });

  it('keeps accepted wager/toll prices separate from terminal losses', () => {
    const bazaar = getAdventureScenario('the-goblin-bazaar');
    const tavern = bazaar.nodes.tavern!;
    expect(tavern.type === 'decision' && tavern.choices[0]!.cost?.credits).toBe(200);
    const broke = bazaar.nodes.broke!;
    expect(broke.type === 'terminal' && broke.outcome.penalties).toBeUndefined();
    const jackpot = bazaar.nodes.jackpot!;
    expect(jackpot.type === 'terminal' && jackpot.outcome.rewards?.credits).toEqual({
      min: 400,
      max: 400,
    });
    const ambush = getAdventureScenario('the-bandit-ambush');
    const root = ambush.nodes.root!;
    expect(root.type === 'decision' && root.choices[1]!.cost?.credits).toBe(150);
    const diplomacy = ambush.nodes.diplomacy!;
    expect(diplomacy.type === 'terminal' && diplomacy.outcome.penalties).toBeUndefined();
  });

  it('rejects catalog item codes that cannot be fulfilled', () => {
    expect(() => validateAdventureScenario(ADVENTURE_SCENARIOS[0]!, new Set())).toThrow(
      'unknown item',
    );
  });
});
