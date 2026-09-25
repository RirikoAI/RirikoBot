import { describe, it, expect, vi } from 'vitest';
import { ScalingEngine } from '../dungeon/scaling-engine.js';
import { ElementalWard } from '../dungeon/elemental-ward.js';
import { SeasonalAffixHandler } from '../dungeon/seasonal-affixes.js';
import { DungeonRunner, getDungeonFloorEnergyCost } from '../dungeon/dungeon-runner.js';
import type { Combatant } from '../combat/types.js';

describe('TASK-1041: PvE Dungeon Progression Core & Scaling Mechanics', () => {
  describe('ScalingEngine (Section 7.5)', () => {
    it('should compute exact baseline values at Floor 1 for all models', () => {
      const engine = new ScalingEngine();
      const statsExp = engine.calculateFloorStats(1, 'EXPONENTIAL');
      expect(statsExp.hp).toBe(1200);
      expect(statsExp.attack).toBe(120);
      expect(statsExp.defense).toBe(80);
      expect(statsExp.speed).toBe(25);

      const statsLin = engine.calculateFloorStats(1, 'LINEAR');
      expect(statsLin.hp).toBe(1200);
      expect(statsLin.attack).toBe(120);

      const statsPoly = engine.calculateFloorStats(1, 'POLYNOMIAL');
      expect(statsPoly.hp).toBe(1200);

      const statsHybrid = engine.calculateFloorStats(1, 'HYBRID');
      expect(statsHybrid.hp).toBe(1200);
    });

    it('should correctly classify floor tiers and apply boss multipliers', () => {
      const engine = new ScalingEngine({ growthRate: 0.085 });

      expect(engine.getFloorType(1)).toBe('STANDARD');
      expect(engine.getBossMultiplier(1)).toBe(1.0);

      expect(engine.getFloorType(5)).toBe('MINI_BOSS');
      expect(engine.getBossMultiplier(5)).toBe(1.75);

      expect(engine.getFloorType(10)).toBe('MAJOR_BOSS');
      expect(engine.getBossMultiplier(10)).toBe(3.2);

      expect(engine.getFloorType(15)).toBe('MINI_BOSS');
      expect(engine.getFloorType(20)).toBe('MAJOR_BOSS');
      expect(engine.getFloorType(50)).toBe('MAJOR_BOSS');
    });

    it('should scale exponentially with r = 0.085 and reach high-tier boss values', () => {
      const engine = new ScalingEngine({ growthRate: 0.085 });

      const f1 = engine.calculateFloorStats(1);
      const f10 = engine.calculateFloorStats(10);
      const f20 = engine.calculateFloorStats(20);
      const f50 = engine.calculateFloorStats(50);

      expect(f1.hp).toBe(1200);
      expect(f10.hp).toBeGreaterThan(8000); // 1200 * (1.085)^9 * 3.2
      expect(f20.hp).toBeGreaterThan(18000);
      expect(f50.hp).toBeGreaterThan(200000);
      expect(f50.attack).toBeGreaterThan(15000);
    });

    it('should provide sample progression table reference checks', () => {
      const engine = new ScalingEngine();
      const sampleF5 = engine.getSampleProgression(5);
      expect(sampleF5).toBeDefined();
      expect(sampleF5?.hp).toBe(3360);
      expect(sampleF5?.check).toBe('Elemental Match check');

      const sampleF50 = engine.getSampleProgression(50);
      expect(sampleF50?.type).toBe('MAJOR_BOSS');
      expect(sampleF50?.hp).toBe(265000);
      expect(sampleF50?.attack).toBe(19500);
    });

    it('should support linear, polynomial, and hybrid scaling models', () => {
      const engine = new ScalingEngine();
      const linearF10 = engine.calculateFloorStats(10, 'LINEAR');
      const polyF10 = engine.calculateFloorStats(10, 'POLYNOMIAL');
      const hybridF10 = engine.calculateFloorStats(10, 'HYBRID');

      expect(linearF10.hp).toBeGreaterThan(1200);
      expect(polyF10.hp).toBeGreaterThan(1200);
      expect(hybridF10.hp).toBeGreaterThan(1200);
    });
  });

  describe('ElementalWard (Section 7.3.1)', () => {
    it('should absorb 100% of damage from non-matching elements', () => {
      const ward = new ElementalWard([
        { element: 'FIRE', health: 1000 },
        { element: 'LIGHTNING', health: 1000 },
        { element: 'ICE', health: 1000 },
      ]);

      expect(ward.isBroken()).toBe(false);
      expect(ward.getCurrentLayer()?.element).toBe('FIRE');

      // Light mythic attacks Fire ward -> 0 damage to boss
      const resultLight = ward.processAttack('LIGHT', 50000);
      expect(resultLight.absorbed).toBe(true);
      expect(resultLight.damagePassedToBoss).toBe(0);
      expect(resultLight.layerBroken).toBe(false);
      expect(ward.getCurrentLayer()?.currentHealth).toBe(1000);
    });

    it('should deplete and shatter layers sequentially with matching elements', () => {
      const ward = new ElementalWard([
        { element: 'FIRE', health: 500 },
        { element: 'LIGHTNING', health: 500 },
      ]);

      // 1. Partial damage to Fire layer
      const hit1 = ward.processAttack('FIRE', 200);
      expect(hit1.absorbed).toBe(true);
      expect(hit1.layerBroken).toBe(false);
      expect(ward.getCurrentLayer()?.currentHealth).toBe(300);

      // 2. Shatter Fire layer
      const hit2 = ward.processAttack('FIRE', 400);
      expect(hit2.layerBroken).toBe(true);
      expect(hit2.brokenElement).toBe('FIRE');
      expect(ward.getCurrentLayer()?.element).toBe('LIGHTNING');

      // 3. Shatter Lightning layer -> all wards down!
      const hit3 = ward.processAttack('LIGHTNING', 600);
      expect(hit3.allWardsBroken).toBe(true);
      expect(hit3.damagePassedToBoss).toBe(100); // 600 - 500 = 100 overflow
      expect(ward.isBroken()).toBe(true);
      expect(ward.getCurrentLayer()).toBeNull();
    });
  });

  describe('SeasonalAffixHandler (Section 7.2)', () => {
    const createMockCombatant = (overrides: Partial<Combatant> = {}): Combatant => ({
      id: 'mock_card',
      name: 'Mock Hero',
      team: 'TEAM_A',
      element: 'WATER',
      rarity: 'RARE',
      level: 20,
      maxHealth: 2000,
      currentHealth: 2000,
      attack: 250,
      defense: 100,
      speed: 50,
      critRate: 0.2,
      critDamage: 1.5,
      maxMp: 100,
      currentMp: 50,
      skillManaCost: 30,
      shield: 0,
      statusEffects: [],
      perks: [],
      hasUsedPhoenixWard: false,
      isAlive: true,
      ...overrides,
    });

    it('S1 Infernal Crucible: Heat Haze reduces non-Fire crit, Scorched Earth burns without shield/purify', () => {
      const handler = new SeasonalAffixHandler('INFERNAL_CRUCIBLE', 'Season 1');
      const waterCard = createMockCombatant({ element: 'WATER', critRate: 0.2 });
      const fireCard = createMockCombatant({ element: 'FIRE', critRate: 0.2 });

      // Start of battle
      handler.applyBattleStartAffixes([waterCard, fireCard]);
      expect(waterCard.critRate).toBeCloseTo(0.05, 2); // 0.2 - 0.15 = 0.05
      expect(fireCard.critRate).toBe(0.2); // Fire is exempt

      // Scorched Earth on Turn 2: unprotected takes 6% max HP burn (120 DMG)
      const boss = createMockCombatant({
        id: 'boss',
        team: 'TEAM_B',
        maxHealth: 5000,
        currentHealth: 5000,
      });
      const logsTurn2 = handler.applyEndOfTurnAffixes(2, [waterCard], boss);
      expect(waterCard.currentHealth).toBe(2000 - 120);
      expect(
        logsTurn2.some((l) => l.message.includes('Scorched Earth') && l.message.includes('seared')),
      ).toBe(true);

      // Earth shielded card is immune to Scorched Earth
      const earthCard = createMockCombatant({
        element: 'EARTH',
        shield: 500,
        currentHealth: 2000,
      });
      const logsProtected = handler.applyEndOfTurnAffixes(2, [earthCard], boss);
      expect(earthCard.currentHealth).toBe(2000);
      expect(logsProtected.some((l) => l.message.includes('protected from Scorched Earth'))).toBe(
        true,
      );
    });

    it('S2 Abyssal Maelstrom: Torrential Deluge cuts speed, Lightning gets +20% bonus', () => {
      const handler = new SeasonalAffixHandler('ABYSSAL_MAELSTROM', 'Season 2');
      const card = createMockCombatant({ speed: 100 });

      handler.applyBattleStartAffixes([card]);
      expect(card.speed).toBe(75); // 100 * 0.75 = 75

      const lightningAttacker = createMockCombatant({ element: 'LIGHTNING' });
      const boss = createMockCombatant({ id: 'boss', team: 'TEAM_B' });
      const modified = handler.modifyDamage(lightningAttacker, boss, 1000);
      expect(modified.damage).toBe(1200); // 1000 * 1.2 = 1200
    });

    it('S3 Celestial Twilight: Light vs Shadow deals 2.0x Catastrophe, healing suppressed by 40%', () => {
      const handler = new SeasonalAffixHandler('CELESTIAL_TWILIGHT', 'Season 3');
      const lightCard = createMockCombatant({ element: 'LIGHT' });
      const shadowBoss = createMockCombatant({ element: 'SHADOW' });

      const catastrophe = handler.modifyDamage(lightCard, shadowBoss, 500);
      expect(catastrophe.damage).toBe(1000); // 500 * 2.0 = 1000

      const heal = handler.modifyHealing(lightCard, 1000);
      expect(heal).toBe(600); // 1000 * (1 - 0.4) = 600
    });
  });

  describe('Floor Energy Scaling (Section 7.4)', () => {
    it('should scale energy requirements across floor brackets and give 0 for tutorial', () => {
      expect(getDungeonFloorEnergyCost(0, true)).toBe(0);
      expect(getDungeonFloorEnergyCost(1, true)).toBe(0);

      expect(getDungeonFloorEnergyCost(1)).toBe(10);
      expect(getDungeonFloorEnergyCost(10)).toBe(10);

      expect(getDungeonFloorEnergyCost(11)).toBe(15);
      expect(getDungeonFloorEnergyCost(25)).toBe(15);

      expect(getDungeonFloorEnergyCost(26)).toBe(20);
      expect(getDungeonFloorEnergyCost(40)).toBe(20);

      expect(getDungeonFloorEnergyCost(41)).toBe(25);
      expect(getDungeonFloorEnergyCost(50)).toBe(25);
    });
  });

  describe('DungeonRunner Combat Simulation', () => {
    it('should execute floor combat, enforce prerequisite floors, and record progress', async () => {
      const mockEnergyRepo: any = {
        consumeEnergy: vi.fn().mockResolvedValue({ success: true, currentEnergy: 90 }),
      };

      const mockProgressRepo: any = {
        getOrCreateProgress: vi.fn().mockResolvedValue({
          userId: 'user123',
          seasonId: 's1',
          highestClearedFloor: 0,
          attemptsCount: 0,
          clearCount: 0,
        }),
        recordFloorAttempt: vi.fn().mockResolvedValue({
          userId: 'user123',
          seasonId: 's1',
          highestClearedFloor: 1,
          attemptsCount: 1,
          clearCount: 1,
        }),
      };

      const runner = new DungeonRunner(mockEnergyRepo, mockProgressRepo);

      const highLevelCard: Combatant = {
        id: 'super_hero',
        name: 'Goddess Athena',
        team: 'TEAM_A',
        element: 'FIRE',
        rarity: 'MYTHIC',
        level: 50,
        maxHealth: 15000,
        currentHealth: 15000,
        attack: 4000,
        defense: 1000,
        speed: 150,
        critRate: 0.5,
        critDamage: 2.0,
        maxMp: 100,
        currentMp: 100,
        skillManaCost: 30,
        shield: 0,
        statusEffects: [],
        perks: [],
        hasUsedPhoenixWard: false,
        isAlive: true,
      };

      const result = await runner.runFloor({
        userId: 'user123',
        seasonId: 's1',
        floorNumber: 1,
        playerParty: [highLevelCard],
      });

      expect(result.success).toBe(true);
      expect(result.victory).toBe(true);
      expect(result.floorNumber).toBe(1);
      expect(result.energySpent).toBe(10);
      expect(result.highestFloorCleared).toBe(1);
      expect(mockEnergyRepo.consumeEnergy).toHaveBeenCalledWith('user123', 10);
      expect(mockProgressRepo.recordFloorAttempt).toHaveBeenCalledWith('user123', 's1', 1, true);
    });

    it('should block jumping to locked floors without clearing prerequisites', async () => {
      const mockEnergyRepo: any = { consumeEnergy: vi.fn() };
      const mockProgressRepo: any = {
        getOrCreateProgress: vi.fn().mockResolvedValue({
          userId: 'user123',
          seasonId: 's1',
          highestClearedFloor: 2,
        }),
      };

      const runner = new DungeonRunner(mockEnergyRepo, mockProgressRepo);
      const dummyCard: any = { id: 'c1', name: 'Hero', currentHealth: 100, isAlive: true };

      // Attempting floor 5 when highest cleared is 2
      const result = await runner.runFloor({
        userId: 'user123',
        seasonId: 's1',
        floorNumber: 5,
        playerParty: [dummyCard],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Floor 5 is locked');
      expect(mockEnergyRepo.consumeEnergy).not.toHaveBeenCalled();
    });
  });
});
