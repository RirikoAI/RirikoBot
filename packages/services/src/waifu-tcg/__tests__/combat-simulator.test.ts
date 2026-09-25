import { describe, it, expect } from 'vitest';
import { CombatSimulator } from '../combat/combat-simulator.js';
import type { Combatant } from '../combat/types.js';

function createMockCombatant(overrides: Partial<Combatant>): Combatant {
  return {
    id: overrides.id ?? 'card_test_1',
    name: overrides.name ?? 'Rias Gremory',
    team: overrides.team ?? 'TEAM_A',
    element: overrides.element ?? 'FIRE',
    rarity: overrides.rarity ?? 'MYTHIC',
    level: overrides.level ?? 50,
    maxHealth: overrides.maxHealth ?? 3000,
    currentHealth: overrides.currentHealth ?? overrides.maxHealth ?? 3000,
    attack: overrides.attack ?? 500,
    defense: overrides.defense ?? 200,
    speed: overrides.speed ?? 100,
    critRate: overrides.critRate ?? 0.1,
    critDamage: overrides.critDamage ?? 1.5,
    maxMp: overrides.maxMp ?? 100,
    currentMp: overrides.currentMp ?? 0,
    skillName: overrides.skillName ?? 'Crimson Flare',
    skillDescription: overrides.skillDescription ?? 'Deals heavy fire damage.',
    skillManaCost: overrides.skillManaCost ?? 50,
    passiveName: overrides.passiveName ?? 'Demonic Aura',
    passiveDescription: overrides.passiveDescription ?? 'Boosts presence.',
    shield: overrides.shield ?? 0,
    statusEffects: overrides.statusEffects ?? [],
    perks: overrides.perks ?? [],
    hasUsedPhoenixWard: false,
    isAlive: true,
  };
}

describe('CombatSimulator Core (TASK-1021)', () => {
  it('should run a 1v1 duel and declare a victor', () => {
    const cardA = createMockCombatant({
      id: 'card_a',
      name: 'Rias Gremory (Fire)',
      element: 'FIRE',
      attack: 600,
      defense: 100,
      maxHealth: 2000,
    });
    const cardB = createMockCombatant({
      id: 'card_b',
      name: 'Esdeath (Ice)',
      element: 'ICE',
      attack: 400,
      defense: 100,
      maxHealth: 1500,
    });

    const simulator = new CombatSimulator({
      rng: () => 0.5, // Deterministic non-crit roll
    });

    const result = simulator.simulate([cardA], [cardB]);
    expect(result.winner).toBe('TEAM_A');
    expect(result.turnsTotal).toBeGreaterThan(0);
    expect(result.logs.length).toBeGreaterThan(0);

    // Verify logs include damage and elemental advantage
    const damageLogs = result.logs.filter(
      (l) => l.actionType === 'ATTACK' || l.actionType === 'SKILL',
    );
    expect(damageLogs.length).toBeGreaterThan(0);
    expect(damageLogs.some((l) => l.message.includes('1.5x'))).toBe(true);
  });

  it('should prioritize faster combatant based on speed stat', () => {
    const fastCard = createMockCombatant({
      id: 'fast_card',
      name: 'Speedster',
      speed: 250,
      attack: 100,
    });
    const slowCard = createMockCombatant({
      id: 'slow_card',
      name: 'Slow Tank',
      speed: 50,
      attack: 100,
    });

    const simulator = new CombatSimulator({ rng: () => 0.5 });
    const result = simulator.simulate([fastCard], [slowCard]);

    // First attack log in turn 1 must be from fastCard
    const firstAttack = result.logs.find(
      (l) => l.actionType === 'ATTACK' || l.actionType === 'SKILL',
    );
    expect(firstAttack?.actorId).toBe('fast_card');
  });

  it('should activate Mana Conduit at start of battle and reduce skill cost', () => {
    const card = createMockCombatant({
      id: 'card_conduit',
      perks: ['MANA_CONDUIT'],
      currentMp: 0,
      skillManaCost: 50,
    });
    const dummy = createMockCombatant({ id: 'dummy', maxHealth: 5000 });

    const simulator = new CombatSimulator({ rng: () => 0.5 });
    const result = simulator.simulate([card], [dummy]);

    const perkLog = result.logs.find(
      (l) => l.actionType === 'PERK' && l.message.includes('Mana Conduit'),
    );
    expect(perkLog).toBeDefined();
    // Mana Conduit grants +25 starting MP
    expect(perkLog?.message).toContain('+25 Start MP');
  });

  it('should revive with 35% HP upon taking fatal damage when Phoenix Ward is equipped', () => {
    const cardPhoenix = createMockCombatant({
      id: 'phoenix_card',
      name: 'Phoenix Hero',
      maxHealth: 1000,
      currentHealth: 100,
      defense: 0,
      perks: ['PHOENIX_WARD'],
    });
    const boss = createMockCombatant({
      id: 'boss',
      name: 'Executioner',
      attack: 800,
      speed: 300, // Acts first
    });

    const simulator = new CombatSimulator({ rng: () => 0.5 });
    const result = simulator.simulate([cardPhoenix], [boss]);

    const reviveLog = result.logs.find((l) => l.actionType === 'REVIVE');
    expect(reviveLog).toBeDefined();
    expect(reviveLog?.message).toContain('Phoenix Ward');
    expect(reviveLog?.message).toContain('350 HP');
  });

  it('should trigger Cosmic Cataclysm every 3rd turn dealing unblockable true damage', () => {
    const cardCosmic = createMockCombatant({
      id: 'cosmic_card',
      name: 'Cosmic Sorceress',
      attack: 300,
      perks: ['COSMIC_CATACLYSM'],
    });
    const targetTank = createMockCombatant({
      id: 'tank',
      name: 'Heavy Tank',
      maxHealth: 10000,
      defense: 2000,
      shield: 500,
    });

    const simulator = new CombatSimulator({ maxTurns: 4, rng: () => 0.5 });
    const result = simulator.simulate([cardCosmic], [targetTank]);

    const cataclysmLogs = result.logs.filter(
      (l) => l.actionType === 'PERK' && l.message.includes('Cosmic Cataclysm'),
    );
    expect(cataclysmLogs.length).toBeGreaterThan(0);
    // 200% of 300 ATK = 600 true damage
    expect(cataclysmLogs[0]?.message).toContain('600 true damage');
  });

  it('should apply Burn DoT from Fire skills and Purify & Flow healing from Water skills', () => {
    const fireCard = createMockCombatant({
      id: 'fire_card',
      element: 'FIRE',
      currentMp: 100, // Can cast skill immediately
      skillManaCost: 50,
      attack: 400,
    });
    const waterCard = createMockCombatant({
      id: 'water_card',
      element: 'WATER',
      currentMp: 100,
      skillManaCost: 50,
      maxHealth: 3000,
      currentHealth: 2000, // Damaged initially to test healing
    });

    const simulator = new CombatSimulator({ maxTurns: 5, rng: () => 0.5 });
    const result = simulator.simulate([fireCard], [waterCard]);

    const burnLog = result.logs.find((l) => l.message.includes('inflicted **Burn**'));
    expect(burnLog).toBeDefined();

    const purifyLog = result.logs.find((l) => l.message.includes('Purify & Flow'));
    expect(purifyLog).toBeDefined();
  });

  it('should trigger soft enrage when combat exceeds 10 turns', () => {
    // Both high HP, zero ATK -> reaches turn 10 enrage
    const stallCardA = createMockCombatant({
      id: 'stall_a',
      maxHealth: 100000,
      currentHealth: 100000,
      attack: 10,
      defense: 1000,
    });
    const stallCardB = createMockCombatant({
      id: 'stall_b',
      maxHealth: 100000,
      currentHealth: 100000,
      attack: 10,
      defense: 1000,
    });

    const simulator = new CombatSimulator({ maxTurns: 15, rng: () => 0.5 });
    const result = simulator.simulate([stallCardA], [stallCardB]);

    const enrageLog = result.logs.find((l) => l.actionType === 'ENRAGE');
    expect(enrageLog).toBeDefined();
    expect(enrageLog?.message).toContain('SOFT ENRAGE ACTIVATED');
  });

  it('should support 3v3 team combat', () => {
    const teamA = [
      createMockCombatant({ id: 'a1', name: 'Alpha 1', element: 'FIRE', maxHealth: 2000 }),
      createMockCombatant({ id: 'a2', name: 'Alpha 2', element: 'ICE', maxHealth: 2000 }),
      createMockCombatant({ id: 'a3', name: 'Alpha 3', element: 'LIGHT', maxHealth: 2000 }),
    ];
    const teamB = [
      createMockCombatant({ id: 'b1', name: 'Beta 1', element: 'WATER', maxHealth: 2000 }),
      createMockCombatant({ id: 'b2', name: 'Beta 2', element: 'EARTH', maxHealth: 2000 }),
      createMockCombatant({ id: 'b3', name: 'Beta 3', element: 'SHADOW', maxHealth: 2000 }),
    ];

    const simulator = new CombatSimulator({ rng: () => 0.5 });
    const result = simulator.simulate(teamA, teamB);

    expect(['TEAM_A', 'TEAM_B', 'DRAW']).toContain(result.winner);
    expect(result.teamA).toHaveLength(3);
    expect(result.teamB).toHaveLength(3);
  });
});
