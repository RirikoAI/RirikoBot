import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createDatabaseClient,
  DungeonBossRepository,
  DungeonFloorRepository,
  DungeonSeasonRepository,
  PlayerEnergyRepository,
  UserDungeonProgressRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import {
  mergeBossDefinitions,
  parseBossDefinition,
  parseFloorLineup,
  resolveEnrage,
} from '../dungeon/boss-definition.js';
import { DungeonRunner } from '../dungeon/dungeon-runner.js';
import { DungeonBattleSession } from '../dungeon/dungeon-battle-session.js';
import { SeasonalAffixHandler } from '../dungeon/seasonal-affixes.js';
import type { Combatant } from '../combat/types.js';

const SEASON = 's1_test';

function player(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'card_1',
    name: 'Hero',
    team: 'TEAM_A',
    element: 'WATER',
    rarity: 'COMMON',
    level: 1,
    maxHealth: 5000,
    currentHealth: 5000,
    attack: 100,
    defense: 50,
    speed: 10,
    critRate: 0,
    critDamage: 1.5,
    maxMp: 100,
    currentMp: 0,
    skillManaCost: 35,
    shield: 0,
    statusEffects: [],
    perks: [],
    hasUsedPhoenixWard: false,
    isAlive: true,
    ...overrides,
  };
}

describe('DB-driven season curves & floor bosses (STORY-151)', () => {
  describe('boss definition parsing', () => {
    it('merges nested overrides and ignores invalid JSON', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(parseBossDefinition({ stats: { hp: -5 } })).toEqual({});
      expect(parseBossDefinition({ unknownField: 1 })).toEqual({});
      expect(warn).toHaveBeenCalledTimes(2);
      warn.mockRestore();

      const merged = mergeBossDefinitions(
        { statMultipliers: { hp: 1.2 }, enrage: { startTurn: 12 } },
        { statMultipliers: { attack: 0.9 }, enrage: { perTurn: 0.5 } },
      );
      expect(merged).toEqual({
        statMultipliers: { hp: 1.2, attack: 0.9 },
        enrage: { startTurn: 12, perTurn: 0.5 },
      });
      expect(resolveEnrage(merged.enrage)).toEqual({
        startTurn: 12,
        perTurn: 0.5,
        trueDamage: true,
      });
      expect(parseFloorLineup([{ bossId: 'b1' }])).toEqual({ bossId: 'b1' });
      expect(parseFloorLineup([])).toBeNull();
    });
  });

  describe('DungeonBattleSession boss behaviour', () => {
    function session(
      boss: Partial<Combatant>,
      enrage?: { startTurn: number; perTurn: number; trueDamage: boolean },
    ) {
      const s = new DungeonBattleSession({
        floorNumber: 5,
        seasonId: SEASON,
        userId: 'u1',
        playerCard: player({ attack: 1 }),
        boss: player({
          id: 'boss',
          name: 'Boss',
          team: 'TEAM_B',
          element: 'FIRE',
          maxHealth: 99999,
          currentHealth: 99999,
          attack: 100,
          defense: 0,
          speed: 1,
          ...boss,
        }),
        affixHandler: new SeasonalAffixHandler('NONE'),
        rng: () => 0.99,
        enrage,
      });
      s.start();
      return s;
    }

    it('casts its skill once it has enough MP', () => {
      const s = session({ skillName: 'Flame Haze', skillManaCost: 40, currentMp: 0 });
      s.executeTurn('ATTACK'); // +20 MP
      s.executeTurn('ATTACK'); // +20 MP -> 40
      const state = s.executeTurn('ATTACK');
      const bossLog = state.lastTurnLogs.find((l) => l.actorId === 'boss');
      expect(bossLog?.actionType).toBe('SKILL');
      expect(bossLog?.message).toContain('Flame Haze');
    });

    it('uses the configured enrage start turn', () => {
      const s = session({ skillManaCost: 0 }, { startTurn: 2, perTurn: 0.5, trueDamage: true });
      const first = s.executeTurn('ATTACK');
      expect(first.lastTurnLogs.some((l) => l.actionType === 'ENRAGE')).toBe(false);
      const second = s.executeTurn('ATTACK');
      expect(second.lastTurnLogs.some((l) => l.actionType === 'ENRAGE')).toBe(true);
      // Enraged true damage: 100 ATK × (1 + 0.5) ignores the player's 50 DEF.
      const bossHit = second.lastTurnLogs.find((l) => l.actorId === 'boss' && l.actionType === 'ATTACK');
      expect(bossHit?.damageDealt).toBe(150);
    });
  });

  describe('with a database', () => {
    let client: SqliteDatabaseClient;
    let runner: DungeonRunner;
    let bossRepo: DungeonBossRepository;
    let floorRepo: DungeonFloorRepository;
    let energyRepo: PlayerEnergyRepository;

    beforeEach(async () => {
      const raw = await createDatabaseClient({
        dialect: 'sqlite',
        url: ':memory:',
        autoMigrate: true,
      });
      if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
      client = raw;
      const seasonRepo = new DungeonSeasonRepository(client);
      bossRepo = new DungeonBossRepository(client);
      floorRepo = new DungeonFloorRepository(client);
      energyRepo = new PlayerEnergyRepository(client);

      await seasonRepo.create({
        id: SEASON,
        name: 'Season 1: Infernal Crucible',
        description: 'test',
        themeElement: 'FIRE',
        seasonalAffixes: ['SCORCHED_EARTH', 'HEAT_HAZE'],
        scalingModel: 'LINEAR',
        scalingParams: {
          baseStats: { hp: 800, attack: 70, defense: 40, speed: 20 },
          linearK: 0.1,
          affixStartFloor: 6,
          enrage: { startTurn: 15, perTurn: 0.25 },
        },
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 86_400_000),
      });

      await bossRepo.upsert({
        id: `${SEASON}:shana`,
        seasonId: SEASON,
        key: 'shana',
        name: 'Shana',
        animeTitle: 'Shakugan no Shana',
        element: 'FIRE',
        tier: 'STANDARD',
        title: 'Flame-Haired Burning-Eyed Hunter',
        flavorText: 'Urusai urusai urusai!',
        imagePath: 'public/bosses/s1_test/shana.png',
        signatureDropCode: 'WEAPON_OBSIDIAN_KATANA',
        definition: {
          statMultipliers: { hp: 1.5 },
          skill: { name: 'Shinku', mpCost: 40, powerMult: 1.8 },
          wardLayers: [{ element: 'WATER', hpPercent: 0.1 }],
        },
      });

      await floorRepo.upsertBySeasonAndFloor({
        seasonId: SEASON,
        floorNumber: 1,
        name: 'Scorched Gate',
        energyCost: 5,
        enemyLineup: [{ bossId: `${SEASON}:shana`, overrides: { stats: { attack: 50 } } }],
      });

      runner = new DungeonRunner(energyRepo, new UserDungeonProgressRepository(client), {
        seasonRepo,
        floorRepo,
        bossRepo,
      });
    });

    afterEach(async () => {
      await client.close();
    });

    it('builds the floor boss from the season curve, boss row and floor overrides', async () => {
      const setup = await runner.prepareFloorSetup({
        userId: 'u1',
        seasonId: SEASON,
        floorNumber: 1,
        playerParty: [player()],
        skipEnergyDeduction: true,
      });

      expect(setup.success).toBe(true);
      expect(setup.energyCost).toBe(5);
      expect(setup.enemyBoss).toMatchObject({
        id: `${SEASON}:shana`,
        name: 'Shana',
        element: 'FIRE',
        maxHealth: 1200, // 800 base × 1.5 boss multiplier
        attack: 50, // floor override wins
        defense: 40,
        skillName: 'Shinku',
        skillManaCost: 40,
      });
      expect(setup.bossSkillPower).toBe(1.8);
      expect(setup.enrage).toEqual({ startTurn: 15, perTurn: 0.25, trueDamage: true });
      expect(setup.elementalWard?.getCurrentLayer()).toMatchObject({
        element: 'WATER',
        maxHealth: 120,
      });
      expect(setup.affixHandler?.getTheme()).toBe('NONE'); // affixes start on floor 6
      expect(setup.bossProfile).toMatchObject({
        animeTitle: 'Shakugan no Shana',
        title: 'Flame-Haired Burning-Eyed Hunter',
        imagePath: 'public/bosses/s1_test/shana.png',
      });
    });

    it('falls back to the season curve and generated boss when a floor has no row', async () => {
      const setup = await runner.prepareFloorSetup({
        userId: 'u1',
        seasonId: SEASON,
        floorNumber: 1,
        playerParty: [player()],
        skipEnergyDeduction: true,
      });
      expect(setup.success).toBe(true);

      await floorRepo.delete((await floorRepo.findBySeasonAndFloor(SEASON, 1))!.id);
      const fallback = await runner.prepareFloorSetup({
        userId: 'u1',
        seasonId: SEASON,
        floorNumber: 1,
        playerParty: [player()],
        skipEnergyDeduction: true,
      });
      expect(fallback.energyCost).toBe(10);
      expect(fallback.enemyBoss).toMatchObject({ maxHealth: 800, attack: 70, skillManaCost: 60 });
      expect(fallback.bossProfile).toBeUndefined();
    });

    it('upserts bosses and floors idempotently', async () => {
      await bossRepo.upsert({
        id: `${SEASON}:shana`,
        seasonId: SEASON,
        key: 'shana',
        name: 'Shana (Renamed)',
        animeTitle: 'Shakugan no Shana',
        element: 'FIRE',
        definition: {},
      });
      expect(await bossRepo.count()).toBe(1);
      expect((await bossRepo.findById(`${SEASON}:shana`))?.name).toBe('Shana (Renamed)');

      const before = await floorRepo.findBySeasonAndFloor(SEASON, 1);
      await floorRepo.upsertBySeasonAndFloor({
        seasonId: SEASON,
        floorNumber: 1,
        name: 'Renamed Gate',
        enemyLineup: [],
      });
      const floors = await floorRepo.listFloorsForSeason(SEASON);
      expect(floors).toHaveLength(1);
      expect(floors[0]).toMatchObject({ id: before!.id, name: 'Renamed Gate' });
    });
  });
});
