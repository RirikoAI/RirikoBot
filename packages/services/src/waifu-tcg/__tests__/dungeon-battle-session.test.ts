import { describe, it, expect, vi } from 'vitest';
import { DungeonBattleSession } from '../dungeon/dungeon-battle-session.js';
import { SeasonalAffixHandler } from '../dungeon/seasonal-affixes.js';
import { ElementalWard } from '../dungeon/elemental-ward.js';
import { DungeonRunner } from '../dungeon/dungeon-runner.js';
import type { Combatant } from '../combat/types.js';

function createMockCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'hero_card_1',
    name: 'Aqua Waifu',
    team: 'TEAM_A',
    element: 'WATER',
    rarity: 'RARE',
    level: 10,
    maxHealth: 1500,
    currentHealth: 1500,
    attack: 250,
    defense: 100,
    speed: 50,
    critRate: 0.1,
    critDamage: 1.5,
    maxMp: 100,
    currentMp: 0,
    skillName: 'Hydro Pump',
    skillDescription: 'Deals 1.5x damage and drenches the foe.',
    skillManaCost: 50,
    passiveName: undefined,
    passiveDescription: undefined,
    shield: 0,
    statusEffects: [],
    perks: [],
    hasUsedPhoenixWard: false,
    isAlive: true,
    ...overrides,
  };
}

describe('TASK-1043: DungeonBattleSession Interactive Real-Time Combat', () => {
  it('should initialize and apply battle start affixes and perks on start()', () => {
    const player = createMockCombatant({ perks: ['MANA_CONDUIT'] });
    const boss = createMockCombatant({
      id: 'boss_1',
      name: 'Infernal Sentinel',
      team: 'TEAM_B',
      element: 'FIRE',
      maxHealth: 3000,
      currentHealth: 3000,
      attack: 200,
      defense: 80,
      speed: 30,
    });

    const affixHandler = new SeasonalAffixHandler('INFERNAL_CRUCIBLE', 'Season 1: Infernal Crucible');
    const session = new DungeonBattleSession({
      floorNumber: 5,
      seasonId: 's1_infernal',
      userId: 'user_123',
      playerCard: player,
      boss,
      affixHandler,
    });

    const initial = session.start();
    expect(initial.turn).toBe(1);
    expect(initial.isFinished).toBe(false);
    expect(initial.player.currentMp).toBe(25); // Mana Conduit adds 25 MP at start
    expect(initial.allLogs.length).toBeGreaterThan(0);
  });

  it('should execute basic attack: increases MP, deals elemental damage to boss', () => {
    const player = createMockCombatant({
      element: 'WATER',
      attack: 300,
      critRate: 0, // Deterministic no-crit
      speed: 60,
    });
    const boss = createMockCombatant({
      id: 'boss_1',
      name: 'Fire Golem',
      team: 'TEAM_B',
      element: 'FIRE',
      defense: 100,
      maxHealth: 2000,
      currentHealth: 2000,
      attack: 150,
      speed: 20,
    });

    const affixHandler = new SeasonalAffixHandler('NONE', 'Standard Tower');
    const session = new DungeonBattleSession({
      floorNumber: 1,
      seasonId: 's1',
      userId: 'user_1',
      playerCard: player,
      boss,
      affixHandler,
      rng: () => 0.5,
    });

    session.start();
    const state = session.executeTurn('ATTACK');

    // Player acts first (speed 60 vs 20)
    // Attack generates +15 MP
    expect(state.player.currentMp).toBe(15);
    // Water vs Fire gives 1.3x advantage
    expect(state.boss.currentHealth).toBeLessThan(2000);
    expect(state.turn).toBe(2);
  });

  it('should execute skill when MP is sufficient: consumes MP and deals 1.5x damage', () => {
    const player = createMockCombatant({
      element: 'FIRE',
      attack: 400,
      currentMp: 60,
      skillManaCost: 50,
      skillName: 'Blazing Nova',
      speed: 100,
    });
    const boss = createMockCombatant({
      id: 'boss_ice',
      name: 'Ice Phantom',
      team: 'TEAM_B',
      element: 'ICE',
      maxHealth: 3000,
      currentHealth: 3000,
      defense: 50,
      attack: 100,
      speed: 10,
    });

    const affixHandler = new SeasonalAffixHandler('NONE', 'Standard');
    const session = new DungeonBattleSession({
      floorNumber: 10,
      seasonId: 's1',
      userId: 'user_1',
      playerCard: player,
      boss,
      affixHandler,
      rng: () => 0.5,
    });

    session.start();
    const state = session.executeTurn('SKILL');

    // Skill should deduct 50 MP
    expect(state.player.currentMp).toBe(10);
    // Fire vs Ice has advantage + 1.5x skill base damage
    expect(state.boss.currentHealth).toBeLessThan(2500);
    // Boss should receive Burn status effect
    const burn = state.boss.statusEffects.find((s) => s.type === 'BURN');
    expect(burn).toBeDefined();
    expect(burn?.duration).toBe(3);
  });

  it('should reduce incoming damage by 50% when DEFEND action is chosen', () => {
    const playerDefending = createMockCombatant({
      defense: 50,
      maxHealth: 1500,
      currentHealth: 1500,
      speed: 10, // Boss attacks first
    });
    const playerAttacking = createMockCombatant({
      defense: 50,
      maxHealth: 1500,
      currentHealth: 1500,
      speed: 10,
    });
    const boss = createMockCombatant({
      id: 'heavy_boss',
      name: 'Titan',
      team: 'TEAM_B',
      element: 'EARTH',
      attack: 500,
      defense: 100,
      speed: 50,
    });

    const affixHandler = new SeasonalAffixHandler('NONE', 'Standard');

    // Case 1: Defending
    const sessionDefend = new DungeonBattleSession({
      floorNumber: 2,
      seasonId: 's1',
      userId: 'u1',
      playerCard: playerDefending,
      boss: { ...boss },
      affixHandler,
      rng: () => 0.5,
    });
    sessionDefend.start();
    const stateDefend = sessionDefend.executeTurn('DEFEND');
    const damageDefended = 1500 - stateDefend.player.currentHealth;

    // Case 2: Not Defending (Attack)
    const sessionAttack = new DungeonBattleSession({
      floorNumber: 2,
      seasonId: 's1',
      userId: 'u2',
      playerCard: playerAttacking,
      boss: { ...boss },
      affixHandler,
      rng: () => 0.5,
    });
    sessionAttack.start();
    const stateAttack = sessionAttack.executeTurn('ATTACK');
    const damageAttacked = 1500 - stateAttack.player.currentHealth;

    expect(damageDefended).toBeLessThan(damageAttacked);
    expect(stateDefend.player.currentMp).toBe(10); // +10 MP on guard
  });

  it('should process Elemental Ward absorption and breakthrough', () => {
    const player = createMockCombatant({
      element: 'WATER',
      attack: 500,
      speed: 80,
    });
    const boss = createMockCombatant({
      id: 'ward_boss',
      name: 'Shielded Warden',
      team: 'TEAM_B',
      element: 'FIRE',
      maxHealth: 2000,
      currentHealth: 2000,
      speed: 10,
    });

    const ward = new ElementalWard([{ element: 'WATER', health: 200 }]);
    const affixHandler = new SeasonalAffixHandler('NONE', 'Standard');
    const session = new DungeonBattleSession({
      floorNumber: 20,
      seasonId: 's1',
      userId: 'u1',
      playerCard: player,
      boss,
      ward,
      affixHandler,
      rng: () => 0.5,
    });

    session.start();
    const state = session.executeTurn('ATTACK');

    // Ward with 200 HP should be shattered by 500+ water damage, passing remaining dmg to boss
    expect(state.ward?.active).toBe(false);
    expect(state.boss.currentHealth).toBeLessThan(2000);
  });

  it('should execute auto turns choosing skill when MP is available', () => {
    const player = createMockCombatant({
      currentMp: 100,
      skillManaCost: 50,
      skillName: 'Tidal Wave',
      speed: 100,
    });
    const boss = createMockCombatant({
      id: 'boss_auto',
      team: 'TEAM_B',
      maxHealth: 5000,
      currentHealth: 5000,
      speed: 10,
    });

    const session = new DungeonBattleSession({
      floorNumber: 3,
      seasonId: 's1',
      userId: 'u1',
      playerCard: player,
      boss,
      affixHandler: new SeasonalAffixHandler('NONE', 'Standard'),
      rng: () => 0.5,
    });

    session.start();
    // Turn 1: has 100 MP -> auto should choose SKILL
    const state1 = session.executeAutoTurn();
    expect(state1.player.currentMp).toBe(50);

    // Turn 2: has 50 MP -> auto should choose SKILL again
    const state2 = session.executeAutoTurn();
    expect(state2.player.currentMp).toBe(0);

    // Turn 3: has 0 MP -> auto should choose ATTACK (+15 MP)
    const state3 = session.executeAutoTurn();
    expect(state3.player.currentMp).toBe(15);
  });

  it('should trigger soft enrage on turn 10+ with massive true damage strikes', () => {
    const player = createMockCombatant({ maxHealth: 20000, currentHealth: 20000, speed: 10 });
    const boss = createMockCombatant({ id: 'enrage_boss', team: 'TEAM_B', maxHealth: 50000, currentHealth: 50000, attack: 500, speed: 50 });

    const session = new DungeonBattleSession({
      floorNumber: 15,
      seasonId: 's1',
      userId: 'u1',
      playerCard: player,
      boss,
      affixHandler: new SeasonalAffixHandler('NONE', 'Standard'),
      rng: () => 0.5,
    });

    session.start();
    // Step to turn 10
    for (let t = 1; t < 10; t++) {
      session.executeTurn('DEFEND');
    }

    const stateTurn10 = session.executeTurn('DEFEND');
    expect(stateTurn10.turn).toBe(11);
    const enrageLog = stateTurn10.allLogs.find((l) => l.actionType === 'ENRAGE');
    expect(enrageLog).toBeDefined();
    expect(enrageLog?.message).toContain('SOFT ENRAGE ACTIVATED');
  });

  it('should correctly forfeit the match', () => {
    const player = createMockCombatant();
    const boss = createMockCombatant({ id: 'boss_forfeit', team: 'TEAM_B' });

    const session = new DungeonBattleSession({
      floorNumber: 1,
      seasonId: 's1',
      userId: 'u1',
      playerCard: player,
      boss,
      affixHandler: new SeasonalAffixHandler('NONE', 'Standard'),
    });

    session.start();
    const state = session.forfeit();
    expect(state.isFinished).toBe(true);
    expect(state.winner).toBe('TEAM_B');
    expect(state.lastTurnLogs[0]?.message).toContain('forfeited');
  });

  it('should integrate with DungeonRunner createBattleSession & finalizeBattleResult', async () => {
    const mockEnergyRepo = {
      consumeEnergy: vi.fn().mockResolvedValue({ success: true, currentEnergy: 50 }),
      getOrCreate: vi.fn().mockResolvedValue({ currentEnergy: 50, maxEnergy: 100 }),
    };
    const mockProgressRepo = {
      getOrCreateProgress: vi.fn().mockResolvedValue({ highestClearedFloor: 0 }),
      recordFloorAttempt: vi.fn().mockResolvedValue({ highestClearedFloor: 1 }),
    };

    const runner = new DungeonRunner(mockEnergyRepo as any, mockProgressRepo as any);
    const player = createMockCombatant({ attack: 9999, speed: 100 }); // Guaranteed 1-shot

    const created = await runner.createBattleSession({
      userId: 'u1',
      seasonId: 'season_tutorial',
      floorNumber: 1,
      playerParty: [player],
      skipEnergyDeduction: true,
    });

    expect(created.success).toBe(true);
    expect(created.session).toBeDefined();

    // 1-shot the tutorial boss
    const finalTurn = created.session!.executeTurn('ATTACK');
    expect(finalTurn.isFinished).toBe(true);
    expect(finalTurn.winner).toBe('TEAM_A');

    const result = await runner.finalizeBattleResult(created.session!, { energySpent: 0 });
    expect(result.success).toBe(true);
    expect(result.victory).toBe(true);
    expect(result.highestFloorCleared).toBe(1);
    expect(result.isFirstClear).toBe(true);
    expect(mockProgressRepo.recordFloorAttempt).toHaveBeenCalledWith('u1', 'season_tutorial', 1, true);
  });

  describe('executeItemTurn', () => {
    it('should consume HP potion, restore health, NOT advance turn, and NOT let boss attack (free action)', () => {
      const player = createMockCombatant({
        id: 'player_hero_1',
        maxHealth: 1000,
        currentHealth: 400,
        attack: 100,
        defense: 50,
      });
      const boss = createMockCombatant({
        id: 'boss_training_1',
        name: 'Training Boss',
        team: 'TEAM_B',
        attack: 80,
        defense: 40,
        speed: 10,
      });

      const session = new DungeonBattleSession({
        floorNumber: 3,
        seasonId: 'season_tutorial',
        userId: 'u1',
        playerCard: player,
        boss,
        affixHandler: new SeasonalAffixHandler('NONE', 'Standard'),
      });

      session.start();

      const itemState = session.executeItemTurn({
        id: 'inv_1',
        code: 'POTION_MINOR_HP',
        name: 'Minor HP Potion',
        subtype: 'HP_POTION',
        consumableEffect: { healFlat: 300, healPercent: 0.25 },
      });

      // 400 + 300 + (1000 * 0.25) = 400 + 300 + 250 = 950 HP
      expect(itemState.player.currentHealth).toBe(950);
      // Turn did NOT advance (still Turn 1)
      expect(itemState.turn).toBe(1);
      expect(itemState.potionUsedThisTurn).toBe(true);
      expect(itemState.allLogs.some((l) => l.message.includes('Minor HP Potion'))).toBe(true);
      // Boss did NOT attack
      expect(itemState.allLogs.some((l) => l.actorName === 'Training Boss' && l.actionType === 'ATTACK')).toBe(false);

      // Attempting to use a second potion on the same turn should be blocked
      const secondPotionState = session.executeItemTurn({
        id: 'inv_2',
        code: 'POTION_MINOR_HP',
        name: 'Minor HP Potion',
        subtype: 'HP_POTION',
        consumableEffect: { healFlat: 50 },
      });
      expect(secondPotionState.allLogs.some((l) => l.message.includes('can only use 1 potion at a time per turn'))).toBe(true);

      // Executing a combat action (e.g. ATTACK) completes the turn and resets potionUsedThisTurn
      const attackState = session.executeTurn('ATTACK');
      expect(attackState.turn).toBe(2);
      expect(attackState.potionUsedThisTurn).toBe(false);
    });

    it('should consume Mana potion, restore MP, and NOT advance turn', () => {
      const player = createMockCombatant({
        id: 'player_hero_2',
        maxMp: 100,
        currentMp: 10,
        attack: 100,
      });
      const boss = createMockCombatant({
        id: 'boss_training_2',
        name: 'Training Boss',
        team: 'TEAM_B',
        attack: 50,
      });

      const session = new DungeonBattleSession({
        floorNumber: 3,
        seasonId: 'season_tutorial',
        userId: 'u1',
        playerCard: player,
        boss,
        affixHandler: new SeasonalAffixHandler('NONE', 'Standard'),
      });

      session.start();

      const itemState = session.executeItemTurn({
        id: 'inv_2',
        code: 'POTION_MANA_DRAUGHT',
        name: 'Mana Draught',
        subtype: 'MANA_POTION',
        consumableEffect: { restoreMp: 30 },
      });

      // 10 + 30 = 40 MP
      expect(itemState.player.currentMp).toBe(40);
      expect(itemState.turn).toBe(1);
      expect(itemState.potionUsedThisTurn).toBe(true);
      expect(itemState.allLogs.some((l) => l.message.includes('Mana Draught'))).toBe(true);
    });

    it('should clamp tutorial bosses damage to at most 100 across tutorial floors', () => {
      const player = createMockCombatant({
        id: 'player_hero_t4',
        defense: 0,
        maxHealth: 1000,
        currentHealth: 1000,
      });
      const boss = createMockCombatant({
        id: 'boss_t4',
        name: 'Warded Guardian Automaton',
        team: 'TEAM_B',
        attack: 500,
      });

      const session = new DungeonBattleSession({
        floorNumber: 4,
        seasonId: 'season_tutorial',
        userId: 'u1',
        playerCard: player,
        boss,
        affixHandler: new SeasonalAffixHandler('NONE', 'Standard'),
      });

      session.start();
      const state = session.executeTurn('ATTACK');

      // Player took damage, but it was capped to at most 100
      const damageTaken = 1000 - state.player.currentHealth;
      expect(damageTaken).toBeLessThanOrEqual(100);
      expect(damageTaken).toBeGreaterThan(0);
    });
  });
});
