import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import {
  DungeonSeasonRepository,
  DungeonFloorRepository,
  UserDungeonProgressRepository,
} from './dungeon.repository.js';

describe('Dungeon Repositories (TASK-1041)', () => {
  let client: SqliteDatabaseClient;
  let seasonRepo: DungeonSeasonRepository;
  let floorRepo: DungeonFloorRepository;
  let progressRepo: UserDungeonProgressRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Create tables in memory
    client.raw.exec(`
      CREATE TABLE dungeon_seasons (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        theme_element TEXT NOT NULL DEFAULT 'ALL',
        seasonal_affixes TEXT DEFAULT '[]',
        scaling_model TEXT NOT NULL DEFAULT 'HYBRID',
        scaling_params TEXT DEFAULT '{}',
        is_tutorial INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        starts_at INTEGER NOT NULL,
        ends_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE dungeon_floors (
        id TEXT PRIMARY KEY,
        season_id TEXT NOT NULL,
        floor_number INTEGER NOT NULL,
        name TEXT NOT NULL,
        energy_cost INTEGER NOT NULL DEFAULT 10,
        min_player_level INTEGER NOT NULL DEFAULT 1,
        enemy_lineup TEXT NOT NULL,
        floor_affixes TEXT DEFAULT '[]',
        is_boss_floor INTEGER NOT NULL DEFAULT 0,
        first_clear_rewards TEXT DEFAULT '{}',
        repeat_rewards_table TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_dungeon_floors_season_floor ON dungeon_floors (season_id, floor_number);

      CREATE TABLE user_dungeon_progress (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        season_id TEXT NOT NULL,
        highest_cleared_floor INTEGER NOT NULL DEFAULT 0,
        attempts_count INTEGER NOT NULL DEFAULT 0,
        clear_count INTEGER NOT NULL DEFAULT 0,
        first_cleared_at INTEGER,
        last_attempt_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX idx_user_dungeon_unique ON user_dungeon_progress (user_id, season_id);
    `);

    seasonRepo = new DungeonSeasonRepository(client);
    floorRepo = new DungeonFloorRepository(client);
    progressRepo = new UserDungeonProgressRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('DungeonSeasonRepository', () => {
    it('creates, queries, and identifies active and tutorial seasons', async () => {
      const now = new Date();
      const in60Days = new Date(Date.now() + 60 * 86400 * 1000);

      const tutorial = await seasonRepo.create({
        id: 'TUTORIAL',
        name: 'Prologue Tower',
        description: 'New summoner onboarding trials.',
        themeElement: 'ALL',
        seasonalAffixes: [],
        scalingModel: 'LINEAR',
        scalingParams: {},
        isTutorial: true,
        isActive: true,
        startsAt: now,
        endsAt: in60Days,
        createdAt: now,
      });

      const s1 = await seasonRepo.create({
        id: 'S1',
        name: 'Infernal Crucible',
        description: 'Volcanic tower of fire and ice.',
        themeElement: 'FIRE',
        seasonalAffixes: ['SCORCHED_EARTH', 'HEAT_HAZE'],
        scalingModel: 'EXPONENTIAL',
        scalingParams: { r: 0.085 },
        isTutorial: false,
        isActive: true,
        startsAt: now,
        endsAt: in60Days,
        createdAt: now,
      });

      expect(tutorial.id).toBe('TUTORIAL');
      expect(s1.id).toBe('S1');

      const foundTutorial = await seasonRepo.findTutorialSeason();
      expect(foundTutorial?.id).toBe('TUTORIAL');

      const foundActive = await seasonRepo.findActiveSeason();
      expect(foundActive?.id).toBe('S1');

      const all = await seasonRepo.listAll();
      expect(all).toHaveLength(2);

      const count = await seasonRepo.count();
      expect(count).toBe(2);
    });
  });

  describe('DungeonFloorRepository', () => {
    it('creates and lists floors sequentially for a season', async () => {
      const now = new Date();
      await floorRepo.create({
        seasonId: 'S1',
        floorNumber: 1,
        name: 'Ember Gates (F1)',
        energyCost: 10,
        minPlayerLevel: 1,
        enemyLineup: [{ name: 'Fire Slime', hp: 1200, atk: 120, def: 80, spd: 25, element: 'FIRE' }],
        floorAffixes: [],
        isBossFloor: false,
        firstClearRewards: { credits: 500, dust: 50 },
        repeatRewardsTable: { credits: 100 },
        createdAt: now,
      });

      await floorRepo.create({
        seasonId: 'S1',
        floorNumber: 5,
        name: 'Magma Sentinel (F5 Mini-Boss)',
        energyCost: 10,
        minPlayerLevel: 5,
        enemyLineup: [{ name: 'Magma Sentinel', hp: 3360, atk: 315, def: 210, spd: 38, element: 'FIRE' }],
        floorAffixes: ['SCORCHED_EARTH'],
        isBossFloor: true,
        firstClearRewards: { credits: 2500, dust: 200 },
        repeatRewardsTable: { credits: 400 },
        createdAt: now,
      });

      const floor1 = await floorRepo.findBySeasonAndFloor('S1', 1);
      expect(floor1?.name).toContain('Ember Gates');
      expect(floor1?.energyCost).toBe(10);

      const floor5 = await floorRepo.findBySeasonAndFloor('S1', 5);
      expect(floor5?.isBossFloor).toBe(true);

      const floors = await floorRepo.listFloorsForSeason('S1');
      expect(floors).toHaveLength(2);
      expect(floors[0]!.floorNumber).toBe(1);
      expect(floors[1]!.floorNumber).toBe(5);

      const count = await floorRepo.count();
      expect(count).toBe(2);
    });
  });

  describe('UserDungeonProgressRepository', () => {
    it('initializes progress, records floor attempts, and ranks leaderboard', async () => {
      // User 1 clears Floor 1, then Floor 2
      const prog1 = await progressRepo.getOrCreateProgress('user_1', 'S1');
      expect(prog1.highestClearedFloor).toBe(0);
      expect(prog1.attemptsCount).toBe(0);

      await progressRepo.recordFloorAttempt('user_1', 'S1', 1, true);
      const afterF1 = await progressRepo.findByUserAndSeason('user_1', 'S1');
      expect(afterF1?.highestClearedFloor).toBe(1);
      expect(afterF1?.attemptsCount).toBe(1);
      expect(afterF1?.clearCount).toBe(1);
      expect(afterF1?.firstClearedAt).not.toBeNull();

      // User 1 fails Floor 2 once, then clears Floor 2
      await progressRepo.recordFloorAttempt('user_1', 'S1', 2, false);
      await progressRepo.recordFloorAttempt('user_1', 'S1', 2, true);
      const afterF2 = await progressRepo.findByUserAndSeason('user_1', 'S1');
      expect(afterF2?.highestClearedFloor).toBe(2);
      expect(afterF2?.attemptsCount).toBe(3);
      expect(afterF2?.clearCount).toBe(2);

      // User 2 reaches Floor 10
      await progressRepo.recordFloorAttempt('user_2', 'S1', 10, true);

      // Leaderboard
      const leaderboard = await progressRepo.getSeasonLeaderboard('S1');
      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0]!.userId).toBe('user_2');
      expect(leaderboard[0]!.highestClearedFloor).toBe(10);
      expect(leaderboard[1]!.userId).toBe('user_1');
      expect(leaderboard[1]!.highestClearedFloor).toBe(2);

      const totalCount = await progressRepo.count();
      expect(totalCount).toBe(2);
    });
  });
});
