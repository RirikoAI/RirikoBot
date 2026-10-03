import { describe, expect, it } from 'vitest';
import { DatabaseError } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import {
  DungeonBossRepository,
  DungeonFloorRepository,
  DungeonSeasonRepository,
  UserDungeonProgressRepository,
} from './dungeon.repository.js';

const MISSING_UUID = '00000000-0000-4000-8000-000000000001';
const DAY = 86_400_000;
const NOW = new Date('2026-09-28T12:00:00.000Z');

const season = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Season ${id}`,
  description: `Description of ${id}`,
  scalingModel: 'EXPONENTIAL' as const,
  startsAt: new Date(NOW.getTime() - 10 * DAY),
  endsAt: new Date(NOW.getTime() + 10 * DAY),
  ...overrides,
});

const floor = (seasonId: string, floorNumber: number, overrides: Record<string, unknown> = {}) => ({
  seasonId,
  floorNumber,
  name: `Floor ${floorNumber}`,
  enemyLineup: [{ name: 'Slime', hp: 100, atk: 10, def: 5, spd: 5, element: 'FIRE' }],
  ...overrides,
});

const boss = (seasonId: string, key: string, overrides: Record<string, unknown> = {}) => ({
  id: `${seasonId}:${key}`,
  seasonId,
  key,
  name: `Boss ${key}`,
  animeTitle: 'Test Anime',
  element: 'FIRE',
  ...overrides,
});

describeDialects('dungeon repositories', (db) => {
  describe('DungeonSeasonRepository', () => {
    it('finds by id, reports existence and counts rows', async () => {
      const repo = new DungeonSeasonRepository(db.client);
      expect(await repo.findById('S1')).toBeNull();
      expect(await repo.exists('S1')).toBe(false);
      expect(await repo.count()).toBe(0);

      const created = await repo.create(season('S1'));
      expect(created.name).toBe('Season S1');

      expect((await repo.findById('S1'))?.description).toBe('Description of S1');
      expect(await repo.exists('S1')).toBe(true);
      expect(await repo.count()).toBe(1);
    });

    it('finds the tutorial season and ignores it as the active season', async () => {
      const repo = new DungeonSeasonRepository(db.client);
      expect(await repo.findTutorialSeason()).toBeNull();
      await repo.create(season('TUT', { isTutorial: true }));
      await repo.create(season('S1'));

      expect((await repo.findTutorialSeason())?.id).toBe('TUT');
      expect((await repo.findActiveSeason(undefined, NOW))?.id).toBe('S1');
    });

    it('lists seasons newest start first', async () => {
      const repo = new DungeonSeasonRepository(db.client);
      await repo.create(season('old', { startsAt: new Date(NOW.getTime() - 30 * DAY) }));
      await repo.create(season('new', { startsAt: new Date(NOW.getTime() - 1 * DAY) }));
      await repo.create(season('mid', { startsAt: new Date(NOW.getTime() - 10 * DAY) }));

      expect((await repo.listAll()).map((s) => s.id)).toEqual(['new', 'mid', 'old']);
    });

    it('updates a season and throws for a missing one', async () => {
      const repo = new DungeonSeasonRepository(db.client);
      await repo.create(season('S1'));

      const updated = await repo.update('S1', { name: 'Renamed', isActive: false });
      expect(updated.name).toBe('Renamed');
      expect((await repo.findById('S1'))?.isActive).toBe(false);
      expect(await repo.findActiveSeason(undefined, NOW)).toBeNull();

      await expect(repo.update('nope', { name: 'x' })).rejects.toThrow(DatabaseError);
    });

    it('deletes a season once', async () => {
      const repo = new DungeonSeasonRepository(db.client);
      await repo.create(season('S1'));

      expect(await repo.delete('S1')).toBe(true);
      expect(await repo.delete('S1')).toBe(false);
      expect(await repo.count()).toBe(0);
    });
  });

  describe('DungeonFloorRepository', () => {
    it('finds floors by id and by season and number', async () => {
      const repo = new DungeonFloorRepository(db.client);
      expect(await repo.findById(MISSING_UUID)).toBeNull();
      expect(await repo.exists(MISSING_UUID)).toBe(false);

      const created = await repo.create(floor('S1', 3, { isBossFloor: true }));
      expect((await repo.findById(created.id))?.floorNumber).toBe(3);
      expect(await repo.exists(created.id)).toBe(true);
      expect((await repo.findBySeasonAndFloor('S1', 3))?.isBossFloor).toBe(true);
      expect(await repo.findBySeasonAndFloor('S1', 4)).toBeNull();
      expect(await repo.findBySeasonAndFloor('S2', 3)).toBeNull();
    });

    it('lists the floors of one season in floor order', async () => {
      const repo = new DungeonFloorRepository(db.client);
      await repo.create(floor('S1', 5));
      await repo.create(floor('S1', 1));
      await repo.create(floor('S2', 2));
      await repo.create(floor('S1', 3));

      expect((await repo.listFloorsForSeason('S1')).map((f) => f.floorNumber)).toEqual([1, 3, 5]);
      expect(await repo.listFloorsForSeason('empty')).toEqual([]);
      expect(await repo.count()).toBe(4);
    });

    it('updates a floor and throws for a missing one', async () => {
      const repo = new DungeonFloorRepository(db.client);
      const created = await repo.create(floor('S1', 1));

      const updated = await repo.update(created.id, { name: 'Renamed', energyCost: 25 });
      expect(updated.name).toBe('Renamed');
      expect(updated.energyCost).toBe(25);

      await expect(repo.update(MISSING_UUID, { name: 'x' })).rejects.toThrow(DatabaseError);
    });

    it('upserts by season and floor number, keeping the id', async () => {
      const repo = new DungeonFloorRepository(db.client);
      const first = await repo.upsertBySeasonAndFloor(floor('S1', 2, { name: 'Original' }));
      const second = await repo.upsertBySeasonAndFloor(
        floor('S1', 2, { name: 'Replaced', energyCost: 40 }),
      );

      expect(second.id).toBe(first.id);
      expect(second.name).toBe('Replaced');
      expect(second.energyCost).toBe(40);
      expect(await repo.count()).toBe(1);
    });

    it('deletes a floor once', async () => {
      const repo = new DungeonFloorRepository(db.client);
      const created = await repo.create(floor('S1', 1));

      expect(await repo.delete(created.id)).toBe(true);
      expect(await repo.delete(created.id)).toBe(false);
      expect(await repo.count()).toBe(0);
    });
  });

  describe('UserDungeonProgressRepository', () => {
    it('creates progress once per user and season', async () => {
      const repo = new UserDungeonProgressRepository(db.client);
      expect(await repo.findById(MISSING_UUID)).toBeNull();
      expect(await repo.exists(MISSING_UUID)).toBe(false);
      expect(await repo.findByUserAndSeason('u1', 'S1')).toBeNull();

      const first = await repo.getOrCreateProgress('u1', 'S1');
      const again = await repo.getOrCreateProgress('u1', 'S1');
      expect(again.id).toBe(first.id);
      expect(first.highestClearedFloor).toBe(0);
      expect(await repo.exists(first.id)).toBe(true);
      expect((await repo.findById(first.id))?.userId).toBe('u1');
      expect(await repo.count()).toBe(1);

      await repo.getOrCreateProgress('u1', 'S2');
      expect(await repo.count()).toBe(2);
    });

    it('records attempts without lowering the highest cleared floor', async () => {
      const repo = new UserDungeonProgressRepository(db.client);

      const failed = await repo.recordFloorAttempt('u1', 'S1', 1, false);
      expect(failed.attemptsCount).toBe(1);
      expect(failed.clearCount).toBe(0);
      expect(failed.firstClearedAt).toBeNull();

      const cleared = await repo.recordFloorAttempt('u1', 'S1', 4, true);
      expect(cleared.highestClearedFloor).toBe(4);
      expect(cleared.clearCount).toBe(1);
      expect(cleared.firstClearedAt).not.toBeNull();

      const replay = await repo.recordFloorAttempt('u1', 'S1', 2, true);
      expect(replay.highestClearedFloor).toBe(4);
      expect(replay.attemptsCount).toBe(3);
      expect(replay.clearCount).toBe(2);
      expect(replay.firstClearedAt?.getTime()).toBe(cleared.firstClearedAt?.getTime());
    });

    it('updates progress and throws for a missing row', async () => {
      const repo = new UserDungeonProgressRepository(db.client);
      const created = await repo.getOrCreateProgress('u1', 'S1');

      const updated = await repo.update(created.id, { clearCount: 7 });
      expect(updated.clearCount).toBe(7);

      await expect(repo.update(MISSING_UUID, { clearCount: 1 })).rejects.toThrow(DatabaseError);
    });

    it('ranks the season leaderboard by floor, clears, then earliest attempt, with a limit', async () => {
      const repo = new UserDungeonProgressRepository(db.client);
      const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
      const entry = (userId: string, floorReached: number, clears: number, minutes: number) =>
        repo.create({
          userId,
          seasonId: 'S1',
          highestClearedFloor: floorReached,
          attemptsCount: clears,
          clearCount: clears,
          lastAttemptAt: at(minutes),
        });
      await entry('low', 3, 3, 0);
      await entry('late', 9, 4, 30);
      await entry('early', 9, 4, 10);
      await entry('more_clears', 9, 6, 50);
      await repo.create({
        userId: 'other_season',
        seasonId: 'S2',
        highestClearedFloor: 40,
        lastAttemptAt: at(0),
      });

      const board = await repo.getSeasonLeaderboard('S1');
      expect(board.map((p) => p.userId)).toEqual(['more_clears', 'early', 'late', 'low']);
      expect((await repo.getSeasonLeaderboard('S1', 2)).map((p) => p.userId)).toEqual([
        'more_clears',
        'early',
      ]);
    });

    it('deletes progress once', async () => {
      const repo = new UserDungeonProgressRepository(db.client);
      const created = await repo.getOrCreateProgress('u1', 'S1');

      expect(await repo.delete(created.id)).toBe(true);
      expect(await repo.delete(created.id)).toBe(false);
      expect(await repo.count()).toBe(0);
    });
  });

  describe('DungeonBossRepository', () => {
    it('upserts a boss by id, replacing every field', async () => {
      const repo = new DungeonBossRepository(db.client);
      const created = await repo.create(boss('S1', 'ifrit', { title: 'Flame Lord' }));
      expect(created.title).toBe('Flame Lord');

      const replaced = await repo.upsert(boss('S1', 'ifrit', { name: 'Ifrit Prime', title: null }));
      expect(replaced.name).toBe('Ifrit Prime');
      expect(replaced.title).toBeNull();
      expect(replaced.createdAt.getTime()).toBe(created.createdAt.getTime());
      expect(await repo.count()).toBe(1);
    });

    it('finds and lists bosses of one season ordered by key', async () => {
      const repo = new DungeonBossRepository(db.client);
      expect(await repo.findById('S1:none')).toBeNull();
      expect(await repo.exists('S1:none')).toBe(false);
      await repo.create(boss('S1', 'zeta'));
      await repo.create(boss('S1', 'alpha'));
      await repo.create(boss('S2', 'beta'));

      expect((await repo.findById('S1:alpha'))?.name).toBe('Boss alpha');
      expect(await repo.exists('S1:alpha')).toBe(true);
      expect((await repo.listForSeason('S1')).map((b) => b.key)).toEqual(['alpha', 'zeta']);
      expect(await repo.listForSeason('S3')).toEqual([]);
      expect(await repo.count()).toBe(3);
    });

    it('updates a boss and throws for a missing one', async () => {
      const repo = new DungeonBossRepository(db.client);
      await repo.create(boss('S1', 'ifrit'));

      const updated = await repo.update('S1:ifrit', { tier: 'MAJOR_BOSS', isActive: false });
      expect(updated.tier).toBe('MAJOR_BOSS');
      expect(updated.isActive).toBe(false);

      await expect(repo.update('S1:missing', { name: 'x' })).rejects.toThrow(DatabaseError);
    });

    it('deletes a boss once', async () => {
      const repo = new DungeonBossRepository(db.client);
      await repo.create(boss('S1', 'ifrit'));

      expect(await repo.delete('S1:ifrit')).toBe(true);
      expect(await repo.delete('S1:ifrit')).toBe(false);
      expect(await repo.count()).toBe(0);
    });
  });
});
