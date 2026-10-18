import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  XpRepository,
  LeaderboardRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { LeaderboardService } from './leaderboard.service.js';
import { LevelingService } from './leveling.service.js';

describe('LeaderboardService', () => {
  let client: SqliteDatabaseClient;
  let xpRepo: XpRepository;
  let leaderboardRepo: LeaderboardRepository;
  let levelingService: LevelingService;
  let leaderboardService: LeaderboardService;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(`
      CREATE TABLE xp_accounts (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 0,
        karma INTEGER NOT NULL DEFAULT 0,
        last_xp_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, guild_id)
      );

      CREATE TABLE xp_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        xp_awarded INTEGER NOT NULL,
        source TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE leaderboard_snapshots (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        global_rank INTEGER NOT NULL,
        server_rank INTEGER NOT NULL,
        calculated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, guild_id)
      );
    `);

    xpRepo = new XpRepository(client);
    leaderboardRepo = new LeaderboardRepository(client);
    levelingService = new LevelingService({ xpRepository: xpRepo });

    leaderboardService = new LeaderboardService({
      leaderboardRepository: leaderboardRepo,
      xpRepository: xpRepo,
      levelingService,
      config: {
        snapshotTtlMs: 5000, // 5 seconds for tests
        refreshIntervalMs: 60000,
        autoRefresh: false,
      },
    });
  });

  afterEach(() => {
    leaderboardService.stopAutoRefresh();
  });

  describe('materializeGlobal', () => {
    it('accurately computes global rankings across multiple guilds and users', async () => {
      // User 1: 500 XP in guild-1, 600 XP in guild-2 -> Total 1100 XP
      // User 2: 1500 XP in guild-1 -> Total 1500 XP
      // User 3: 200 XP in guild-2 -> Total 200 XP
      await xpRepo.create({ userId: 'user-1', guildId: 'guild-1', xp: 500, level: 3 });
      await xpRepo.create({ userId: 'user-1', guildId: 'guild-2', xp: 600, level: 3 });
      await xpRepo.create({ userId: 'user-2', guildId: 'guild-1', xp: 1500, level: 5 });
      await xpRepo.create({ userId: 'user-3', guildId: 'guild-2', xp: 200, level: 1 });

      const globalMap = await leaderboardService.materializeGlobal();

      expect(globalMap.size).toBe(3);
      expect(globalMap.get('user-2')).toBe(1); // 1500 XP -> #1
      expect(globalMap.get('user-1')).toBe(2); // 1100 XP -> #2
      expect(globalMap.get('user-3')).toBe(3); // 200 XP -> #3

      // Verify global snapshots stored in DB
      const snapshotU2 = await leaderboardRepo.getUserRank('user-2', 'global');
      expect(snapshotU2).not.toBeNull();
      expect(snapshotU2?.globalRank).toBe(1);
      expect(snapshotU2?.serverRank).toBe(1);

      const snapshotU1 = await leaderboardRepo.getUserRank('user-1', 'global');
      expect(snapshotU1).not.toBeNull();
      expect(snapshotU1?.globalRank).toBe(2);
    });
  });

  describe('materializeGuild', () => {
    it('computes server ranks and joins with precalculated global ranks', async () => {
      await xpRepo.create({ userId: 'user-a', guildId: 'guild-x', xp: 2000, level: 6 });
      await xpRepo.create({ userId: 'user-b', guildId: 'guild-x', xp: 1000, level: 4 });
      await xpRepo.create({ userId: 'user-c', guildId: 'guild-x', xp: 3000, level: 7 });

      const globalMap = new Map<string, number>([
        ['user-c', 5],
        ['user-a', 10],
        ['user-b', 20],
      ]);

      const count = await leaderboardService.materializeGuild('guild-x', globalMap);
      expect(count).toBe(3);

      // Server ranks should be:
      // user-c: #1 (3000 XP)
      // user-a: #2 (2000 XP)
      // user-b: #3 (1000 XP)
      const rankC = await leaderboardRepo.getUserRank('user-c', 'guild-x');
      expect(rankC?.serverRank).toBe(1);
      expect(rankC?.globalRank).toBe(5);

      const rankA = await leaderboardRepo.getUserRank('user-a', 'guild-x');
      expect(rankA?.serverRank).toBe(2);
      expect(rankA?.globalRank).toBe(10);

      const rankB = await leaderboardRepo.getUserRank('user-b', 'guild-x');
      expect(rankB?.serverRank).toBe(3);
      expect(rankB?.globalRank).toBe(20);
    });
  });

  describe('materializeAll', () => {
    it('processes all active guilds and global ranks in a single sweep', async () => {
      await xpRepo.create({ userId: 'user-1', guildId: 'guild-alpha', xp: 500, level: 3 });
      await xpRepo.create({ userId: 'user-2', guildId: 'guild-alpha', xp: 1000, level: 4 });
      await xpRepo.create({ userId: 'user-3', guildId: 'guild-beta', xp: 1500, level: 5 });

      const summary = await leaderboardService.materializeAll();

      expect(summary.guildsProcessed).toBe(2);
      expect(summary.globalUsersRanked).toBe(3);
      // 3 global snapshots + 2 in alpha + 1 in beta = 6 total snapshots
      expect(summary.snapshotsCreated).toBe(6);
      expect(summary.durationMs).toBeGreaterThanOrEqual(0);
      expect(summary.calculatedAt).toBeInstanceOf(Date);
    });
  });

  describe('getUserRank (O(1) lookups & fallback calculation)', () => {
    it('returns cached snapshot within TTL with isCached: true', async () => {
      await xpRepo.create({ userId: 'user-target', guildId: 'guild-1', xp: 800, level: 4 });

      // Pre-insert snapshot
      await leaderboardRepo.create({
        userId: 'user-target',
        guildId: 'guild-1',
        serverRank: 2,
        globalRank: 42,
        calculatedAt: new Date(),
      });

      const rankInfo = await leaderboardService.getUserRank('user-target', 'guild-1');

      expect(rankInfo).not.toBeNull();
      expect(rankInfo?.userId).toBe('user-target');
      expect(rankInfo?.guildId).toBe('guild-1');
      expect(rankInfo?.serverRank).toBe(2);
      expect(rankInfo?.globalRank).toBe(42);
      expect(rankInfo?.totalXp).toBe(800);
      expect(rankInfo?.level).toBe(4);
      expect(rankInfo?.isCached).toBe(true);
    });

    it('performs dynamic fallback calculation when snapshot does not exist', async () => {
      await xpRepo.create({ userId: 'alice', guildId: 'guild-fall', xp: 1200, level: 5 });
      await xpRepo.create({ userId: 'bob', guildId: 'guild-fall', xp: 800, level: 4 });

      // No snapshot created yet
      const rankInfo = await leaderboardService.getUserRank('bob', 'guild-fall');

      expect(rankInfo).not.toBeNull();
      expect(rankInfo?.userId).toBe('bob');
      expect(rankInfo?.serverRank).toBe(2); // 800 < 1200
      expect(rankInfo?.globalRank).toBe(2);
      expect(rankInfo?.isCached).toBe(false);

      // Verify that the fallback dynamically saved a snapshot into the repository
      const cached = await leaderboardRepo.getUserRank('bob', 'guild-fall');
      expect(cached).not.toBeNull();
      expect(cached?.serverRank).toBe(2);
    });

    it('refreshes stale snapshot when TTL has expired', async () => {
      await xpRepo.create({ userId: 'charlie', guildId: 'guild-ttl', xp: 500, level: 3 });

      // Snapshot from 10 seconds ago (TTL is 5 seconds)
      const oldTime = new Date(Date.now() - 10000);
      await leaderboardRepo.create({
        userId: 'charlie',
        guildId: 'guild-ttl',
        serverRank: 99,
        globalRank: 999,
        calculatedAt: oldTime,
      });

      const refreshed = await leaderboardService.getUserRank('charlie', 'guild-ttl');

      expect(refreshed).not.toBeNull();
      expect(refreshed?.isCached).toBe(false); // dynamically recalculated because stale
      expect(refreshed?.serverRank).toBe(1); // actually #1 since only user in guild
      expect(refreshed?.globalRank).toBe(1);
    });

    it('returns null when querying a user with no XP records', async () => {
      const nonExistent = await leaderboardService.getUserRank('ghost-user', 'any-guild');
      expect(nonExistent).toBeNull();
    });
  });

  describe('getServerLeaderboard', () => {
    it('returns paginated server rankings enriched with member XP and level', async () => {
      for (let i = 1; i <= 15; i++) {
        await xpRepo.create({
          userId: `member-${i}`,
          guildId: 'guild-page',
          xp: i * 100,
          level: Math.floor(i / 3),
        });
      }

      await leaderboardService.materializeGuild('guild-page');

      // Page 1 (items 1-10)
      const page1 = await leaderboardService.getServerLeaderboard('guild-page', 1, 10);
      expect(page1.items.length).toBe(10);
      expect(page1.total).toBe(15);
      expect(page1.page).toBe(1);
      expect(page1.totalPages).toBe(2);
      expect(page1.items[0]?.rank).toBe(1);
      expect(page1.items[0]?.userId).toBe('member-15'); // 1500 XP
      expect(page1.items[0]?.xp).toBe(1500);

      // Page 2 (items 11-15)
      const page2 = await leaderboardService.getServerLeaderboard('guild-page', 2, 10);
      expect(page2.items.length).toBe(5);
      expect(page2.items[0]?.rank).toBe(11);
      expect(page2.items[4]?.rank).toBe(15);
      expect(page2.items[4]?.userId).toBe('member-1'); // 100 XP
    });

    it('triggers on-demand materialization if no snapshots exist yet', async () => {
      await xpRepo.create({ userId: 'u1', guildId: 'guild-lazy', xp: 500, level: 3 });
      await xpRepo.create({ userId: 'u2', guildId: 'guild-lazy', xp: 1000, level: 4 });

      // Call getServerLeaderboard directly without explicit materialize
      const page = await leaderboardService.getServerLeaderboard('guild-lazy', 1, 10);

      expect(page.total).toBe(2);
      expect(page.items.length).toBe(2);
      expect(page.items[0]?.userId).toBe('u2'); // 1000 XP
      expect(page.items[0]?.rank).toBe(1);
      expect(page.items[1]?.userId).toBe('u1'); // 500 XP
      expect(page.items[1]?.rank).toBe(2);
    });
  });

  describe('getGlobalLeaderboard', () => {
    it('returns cross-server global rankings with aggregated total XP', async () => {
      // User 1: 100 in G1, 900 in G2 -> Total 1000 XP
      // User 2: 700 in G1 -> Total 700 XP
      // User 3: 1500 in G3 -> Total 1500 XP
      await xpRepo.create({ userId: 'user-1', guildId: 'g1', xp: 100, level: 1 });
      await xpRepo.create({ userId: 'user-1', guildId: 'g2', xp: 900, level: 4 });
      await xpRepo.create({ userId: 'user-2', guildId: 'g1', xp: 700, level: 3 });
      await xpRepo.create({ userId: 'user-3', guildId: 'g3', xp: 1500, level: 5 });

      await leaderboardService.materializeGlobal();

      const globalPage = await leaderboardService.getGlobalLeaderboard(1, 10);

      expect(globalPage.total).toBe(3);
      expect(globalPage.items.length).toBe(3);

      expect(globalPage.items[0]?.userId).toBe('user-3'); // 1500 XP -> #1
      expect(globalPage.items[0]?.xp).toBe(1500);
      expect(globalPage.items[0]?.rank).toBe(1);

      expect(globalPage.items[1]?.userId).toBe('user-1'); // 1000 XP -> #2
      expect(globalPage.items[1]?.xp).toBe(1000);
      expect(globalPage.items[1]?.rank).toBe(2);

      expect(globalPage.items[2]?.userId).toBe('user-2'); // 700 XP -> #3
      expect(globalPage.items[2]?.xp).toBe(700);
      expect(globalPage.items[2]?.rank).toBe(3);
    });

    it('triggers on-demand materialization if no global snapshots exist yet', async () => {
      await xpRepo.create({ userId: 'glob-1', guildId: 'gA', xp: 2500, level: 6 });

      const page = await leaderboardService.getGlobalLeaderboard(1, 10);

      expect(page.total).toBe(1);
      expect(page.items[0]?.userId).toBe('glob-1');
      expect(page.items[0]?.xp).toBe(2500);
      expect(page.items[0]?.rank).toBe(1);
    });
  });

  describe('Auto-Refresh Lifecycle', () => {
    it('manages background timer start, query, and stop cleanly', () => {
      expect(leaderboardService.isAutoRefreshRunning()).toBe(false);

      leaderboardService.startAutoRefresh();
      expect(leaderboardService.isAutoRefreshRunning()).toBe(true);

      // Repeated call should not duplicate timer
      leaderboardService.startAutoRefresh();
      expect(leaderboardService.isAutoRefreshRunning()).toBe(true);

      leaderboardService.stopAutoRefresh();
      expect(leaderboardService.isAutoRefreshRunning()).toBe(false);

      // Stop on stopped is safe
      leaderboardService.stopAutoRefresh();
      expect(leaderboardService.isAutoRefreshRunning()).toBe(false);
    });
  });
});
