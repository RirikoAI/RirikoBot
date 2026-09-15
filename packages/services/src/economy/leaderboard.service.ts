import type {
  LeaderboardRepository,
  XpRepository,
  NewLeaderboardSnapshot,
} from '@ririko/database';
import type {
  LeaderboardConfig,
  LeaderboardEntry,
  LeaderboardPage,
  MaterializeSummary,
  UserRankInfo,
} from './types.js';
import type { LevelingService } from './leveling.service.js';

export interface LeaderboardServiceOptions {
  leaderboardRepository: LeaderboardRepository;
  xpRepository: XpRepository;
  levelingService?: LevelingService | undefined;
  config?: LeaderboardConfig | undefined;
}

/**
 * Leaderboard & Ranking Service implementing Section 33 of BLUEPRINT.md and Section 6 of docs/economy.md:
 * - High-speed materialized snapshot engine populating `leaderboard_snapshots`.
 * - O(1) indexed dense rank lookups without full table scans.
 * - Dual leaderboards: Global (/leaderboard global) and Server (/leaderboard server).
 * - Snapshot TTL caching with dynamic fallback calculation.
 * - Background periodic auto-refresh timer.
 */
interface ResolvedLeaderboardConfig {
  snapshotTtlMs: number;
  refreshIntervalMs: number;
  autoRefresh: boolean;
}

export class LeaderboardService {
  private readonly leaderboardRepository: LeaderboardRepository;
  private readonly xpRepository: XpRepository;
  private readonly levelingService?: LevelingService | undefined;
  private readonly config: ResolvedLeaderboardConfig;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(options: LeaderboardServiceOptions) {
    this.leaderboardRepository = options.leaderboardRepository;
    this.xpRepository = options.xpRepository;
    this.levelingService = options.levelingService;
    this.config = {
      snapshotTtlMs: options.config?.snapshotTtlMs ?? 10 * 60 * 1000, // 10 minutes default
      refreshIntervalMs: options.config?.refreshIntervalMs ?? 10 * 60 * 1000,
      autoRefresh: options.config?.autoRefresh ?? false,
    };

    if (this.config.autoRefresh) {
      this.startAutoRefresh();
    }
  }

  /**
   * Computes cross-server global ranks, upserts global snapshots with guildId = 'global',
   * and returns a Map of userId -> globalRank.
   */
  public async materializeGlobal(): Promise<Map<string, number>> {
    const globalTotals = await this.xpRepository.getGlobalUserXpTotals();
    const globalMap = new Map<string, number>();
    const now = new Date();
    const snapshots: NewLeaderboardSnapshot[] = [];

    for (let i = 0; i < globalTotals.length; i++) {
      const entry = globalTotals[i];
      if (!entry) continue;

      const rank = i + 1;
      globalMap.set(entry.userId, rank);

      snapshots.push({
        userId: entry.userId,
        guildId: 'global',
        globalRank: rank,
        serverRank: rank,
        calculatedAt: now,
      });
    }

    if (snapshots.length > 0) {
      await this.leaderboardRepository.upsertBatch(snapshots);
    }

    return globalMap;
  }

  /**
   * Computes server rankings for a specific guild and upserts snapshots.
   */
  public async materializeGuild(
    guildId: string,
    globalMap?: Map<string, number>,
  ): Promise<number> {
    const resolvedGlobalMap = globalMap ?? (await this.materializeGlobal());
    const accounts = await this.xpRepository.getAllGuildAccounts(guildId);
    if (accounts.length === 0) return 0;

    const now = new Date();
    const snapshots: NewLeaderboardSnapshot[] = [];

    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i];
      if (!acc) continue;

      const serverRank = i + 1;
      const globalRank = resolvedGlobalMap.get(acc.userId) ?? resolvedGlobalMap.size + 1;

      snapshots.push({
        userId: acc.userId,
        guildId,
        serverRank,
        globalRank,
        calculatedAt: now,
      });
    }

    await this.leaderboardRepository.upsertBatch(snapshots);
    return snapshots.length;
  }

  /**
   * Executes a complete materialization sweep across global rankings and all active guilds.
   */
  public async materializeAll(guildIds?: string[]): Promise<MaterializeSummary> {
    const startTime = Date.now();
    const now = new Date();

    // 1. Materialize global ranks first
    const globalMap = await this.materializeGlobal();

    // 2. Discover target guilds
    const targetGuildIds = guildIds ?? (await this.xpRepository.getDistinctGuildIds());

    // 3. Materialize each guild
    let totalGuildSnapshots = 0;
    for (const gId of targetGuildIds) {
      const count = await this.materializeGuild(gId, globalMap);
      totalGuildSnapshots += count;
    }

    const totalCreated = globalMap.size + totalGuildSnapshots;

    return {
      guildsProcessed: targetGuildIds.length,
      snapshotsCreated: totalCreated,
      globalUsersRanked: globalMap.size,
      durationMs: Date.now() - startTime,
      calculatedAt: now,
    };
  }

  /**
   * Retrieves a user's server rank and global rank using O(1) indexed lookup.
   * If the cached snapshot is missing or stale beyond snapshotTtlMs,
   * performs dynamic fallback calculation and caches the updated snapshot.
   */
  public async getUserRank(
    userId: string,
    guildId: string,
  ): Promise<UserRankInfo | null> {
    const cached = await this.leaderboardRepository.getUserRank(userId, guildId);
    const now = Date.now();

    // Cache hit: valid snapshot within TTL
    if (cached && now - cached.calculatedAt.getTime() <= this.config.snapshotTtlMs) {
      const account = await this.xpRepository.getAccount(userId, guildId);
      return {
        userId,
        guildId,
        globalRank: cached.globalRank,
        serverRank: cached.serverRank,
        totalXp: account ? Number(account.xp) : 0,
        level: account?.level ?? 0,
        calculatedAt: cached.calculatedAt,
        isCached: true,
      };
    }

    // Dynamic fallback calculation
    const account = await this.xpRepository.getAccount(userId, guildId);
    if (!account) {
      // User has no XP account in this guild
      return null;
    }

    const guildRankRes = await this.xpRepository.getUserGuildRank(userId, guildId);
    const globalRankRes = await this.xpRepository.getUserGlobalRank(userId);

    const serverRank = guildRankRes?.rank ?? 1;
    const globalRank = globalRankRes?.rank ?? 1;
    const calculatedAt = new Date();

    // Upsert fresh snapshot to ensure future queries are O(1)
    await this.leaderboardRepository.upsertBatch([
      {
        userId,
        guildId,
        serverRank,
        globalRank,
        calculatedAt,
      },
    ]);

    return {
      userId,
      guildId,
      globalRank,
      serverRank,
      totalXp: Number(account.xp),
      level: account.level,
      calculatedAt,
      isCached: false,
    };
  }

  /**
   * Retrieves paginated server rankings ordered by serverRank ascending (1, 2, 3...).
   * Automatically materializes the guild snapshot if not yet calculated.
   */
  public async getServerLeaderboard(
    guildId: string,
    page = 1,
    pageSize = 10,
  ): Promise<LeaderboardPage> {
    const validPage = Math.max(1, Math.floor(page));
    const validPageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
    const offset = (validPage - 1) * validPageSize;

    let paginated = await this.leaderboardRepository.getServerLeaderboard(guildId, {
      limit: validPageSize,
      offset,
    });

    // If no snapshots exist for this guild, check if accounts exist and materialize on-demand
    if (paginated.total === 0) {
      const accountsCount = await this.xpRepository.getAllGuildAccounts(guildId);
      if (accountsCount.length > 0) {
        await this.materializeGuild(guildId);
        paginated = await this.leaderboardRepository.getServerLeaderboard(guildId, {
          limit: validPageSize,
          offset,
        });
      }
    }

    const items: LeaderboardEntry[] = await Promise.all(
      paginated.items.map(async (snapshot) => {
        const acc = await this.xpRepository.getAccount(snapshot.userId, guildId);
        return {
          rank: snapshot.serverRank,
          userId: snapshot.userId,
          guildId: snapshot.guildId,
          xp: acc ? Number(acc.xp) : 0,
          level: acc?.level ?? 0,
          globalRank: snapshot.globalRank,
          calculatedAt: snapshot.calculatedAt,
        };
      }),
    );

    const totalPages = Math.ceil(paginated.total / validPageSize) || 1;

    return {
      items,
      total: paginated.total,
      limit: validPageSize,
      offset,
      page: validPage,
      totalPages,
    };
  }

  /**
   * Retrieves paginated global rankings ordered by globalRank ascending.
   * Automatically materializes global snapshots if not yet calculated.
   */
  public async getGlobalLeaderboard(
    page = 1,
    pageSize = 10,
  ): Promise<LeaderboardPage> {
    const validPage = Math.max(1, Math.floor(page));
    const validPageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
    const offset = (validPage - 1) * validPageSize;

    let paginated = await this.leaderboardRepository.getGlobalLeaderboard({
      limit: validPageSize,
      offset,
    });

    // If no global snapshots exist, check if XP data exists and materialize on-demand
    if (paginated.total === 0) {
      const globalTotals = await this.xpRepository.getGlobalUserXpTotals();
      if (globalTotals.length > 0) {
        await this.materializeGlobal();
        paginated = await this.leaderboardRepository.getGlobalLeaderboard({
          limit: validPageSize,
          offset,
        });
      }
    }

    const items: LeaderboardEntry[] = await Promise.all(
      paginated.items.map(async (snapshot) => {
        const globalRankInfo = await this.xpRepository.getUserGlobalRank(snapshot.userId);
        const totalXp = globalRankInfo?.totalXp ?? 0;
        const level = this.levelingService
          ? this.levelingService.getLevelProgress(totalXp).level
          : this.calculateLevelFallback(totalXp);

        return {
          rank: snapshot.globalRank,
          userId: snapshot.userId,
          guildId: 'global',
          xp: totalXp,
          level,
          globalRank: snapshot.globalRank,
          calculatedAt: snapshot.calculatedAt,
        };
      }),
    );

    const totalPages = Math.ceil(paginated.total / validPageSize) || 1;

    return {
      items,
      total: paginated.total,
      limit: validPageSize,
      offset,
      page: validPage,
      totalPages,
    };
  }

  /**
   * Fallback closed-form level calculation if LevelingService is not injected.
   */
  private calculateLevelFallback(totalXp: number): number {
    if (totalXp <= 0) return 0;
    let low = 0;
    let high = 100000;
    let level = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const L = mid;
      const sumSquares = Math.floor(((L - 1) * L * (2 * L - 1)) / 6);
      const sumLinear = Math.floor(((L - 1) * L) / 2);
      const reqXp = L === 0 ? 0 : 5 * sumSquares + 50 * sumLinear + 100 * L;

      if (reqXp <= totalXp) {
        level = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return level;
  }

  /**
   * Starts periodic background materialization timer.
   */
  public startAutoRefresh(): void {
    if (this.refreshTimer !== null) return;

    this.refreshTimer = setInterval(() => {
      void this.materializeAll().catch((err: unknown) => {
        console.error('Failed to run periodic leaderboard materialization:', err);
      });
    }, this.config.refreshIntervalMs);

    if (this.refreshTimer.unref) {
      this.refreshTimer.unref();
    }
  }

  /**
   * Stops periodic background materialization timer.
   */
  public stopAutoRefresh(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Checks whether the auto-refresh background timer is currently active.
   */
  public isAutoRefreshRunning(): boolean {
    return this.refreshTimer !== null;
  }
}
