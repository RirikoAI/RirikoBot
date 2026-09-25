import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCanvas,
  type Canvas,
} from '@napi-rs/canvas';
import {
  ProfileCardRenderer,
} from './profile-card.renderer.js';
import { parseImageDimensions } from './profile-background.manager.js';
import type { ProfileCardData, EquippedTcgCardView } from './types.js';
import {
  createDatabaseClient,
  UserRepository,
  EconomyRepository,
  XpRepository,
  GuildSettingsRepository,
  LeaderboardRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { LevelingService } from './leveling.service.js';
import { LeaderboardService } from './leaderboard.service.js';
import { EventBus } from '@ririko/core';

function createSampleImageBuffer(w = 100, h = 100, color = 'blue'): Buffer {
  const canvas: Canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return canvas.toBuffer('image/png');
}

describe('ProfileCardRenderer', () => {
  let renderer: ProfileCardRenderer;

  beforeEach(() => {
    renderer = new ProfileCardRenderer();
  });

  describe('renderProfileCard (direct data)', () => {
    it('should generate a valid 1200x400 PNG buffer with default cyber mesh background and initials avatar', async () => {
      const data: ProfileCardData = {
        userId: 'user_123',
        username: 'rin_tohsaka',
        displayName: 'Rin Tohsaka',
        presenceStatus: 'online',
        level: 24,
        currentLevelXp: 450,
        xpForNextLevel: 1200,
        totalXp: 35400,
        progressPercent: 37.5,
        walletBalance: 14250,
        bankBalance: 125000,
        bankCapacity: 200000,
        karma: 42,
        serverRank: 3,
        globalRank: 120,
      };

      const buffer = await renderer.renderProfileCard(data);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);

      const dims = parseImageDimensions(buffer);
      expect(dims).toEqual({
        width: 1200,
        height: 400,
        format: 'png',
      });
    });

    it('should render correctly with custom avatar and custom background buffers', async () => {
      const avatarBuf = createSampleImageBuffer(150, 150, '#e11d48');
      const bgBuf = createSampleImageBuffer(1200, 400, '#1e1b4b');

      const data: ProfileCardData = {
        userId: 'user_456',
        username: 'saber_artoria',
        displayName: 'Artoria Pendragon',
        avatarBuffer: avatarBuf,
        customBackgroundBuffer: bgBuf,
        presenceStatus: 'dnd',
        level: 50,
        currentLevelXp: 9800,
        xpForNextLevel: 10000,
        totalXp: 250000,
        progressPercent: 98.0,
        walletBalance: 500000,
        bankBalance: 2500000,
        karma: 150,
        serverRank: 1,
        globalRank: 5,
      };

      const buffer = await renderer.renderProfileCard(data);
      const dims = parseImageDimensions(buffer);

      expect(dims).toEqual({
        width: 1200,
        height: 400,
        format: 'png',
      });
    });

    it('should render equipped Waifu TCG card with rarity styling and serial tag', async () => {
      const cardArtBuf = createSampleImageBuffer(180, 260, '#f59e0b');

      const equippedCard: EquippedTcgCardView = {
        id: 'card_tcg_01',
        name: 'Holo the Wise Wolf',
        rarity: 'LEGENDARY',
        serialNumber: '#0001',
        imageBuffer: cardArtBuf,
      };

      const data: ProfileCardData = {
        userId: 'user_789',
        username: 'holo_lover',
        displayName: 'Lawrence & Holo',
        presenceStatus: 'idle',
        level: 12,
        currentLevelXp: 120,
        xpForNextLevel: 600,
        totalXp: 8500,
        progressPercent: 20,
        walletBalance: 1200,
        bankBalance: 5000,
        karma: 10,
        serverRank: 15,
        globalRank: 'N/A',
        equippedCard,
      };

      const buffer = await renderer.renderProfileCard(data);
      const dims = parseImageDimensions(buffer);

      expect(dims).toEqual({
        width: 1200,
        height: 400,
        format: 'png',
      });
    });

    it('should render cleanly with empty equipped card slot placeholder', async () => {
      const data: ProfileCardData = {
        userId: 'user_newbie',
        username: 'rookie_99',
        displayName: 'Rookie Adventurer',
        presenceStatus: 'offline',
        level: 0,
        currentLevelXp: 0,
        xpForNextLevel: 100,
        totalXp: 0,
        progressPercent: 0,
        walletBalance: 0,
        bankBalance: 0,
        karma: 0,
        serverRank: 'N/A',
        globalRank: 'N/A',
        equippedCard: undefined,
      };

      const buffer = await renderer.renderProfileCard(data);
      const dims = parseImageDimensions(buffer);

      expect(dims).toEqual({
        width: 1200,
        height: 400,
        format: 'png',
      });
    });

    it('should handle all presence statuses and extreme balance numbers without crashing', async () => {
      const statuses = ['online', 'idle', 'dnd', 'offline'] as const;

      for (const status of statuses) {
        const buffer = await renderer.renderProfileCard({
          userId: `user_${status}`,
          username: `user_${status}`,
          displayName: `User With Very Long Display Name Exceeding Normal Width Limit`,
          presenceStatus: status,
          level: 999,
          currentLevelXp: 9999999,
          xpForNextLevel: 10000000,
          totalXp: 999999999,
          progressPercent: 99.9,
          walletBalance: 1234567890123n,
          bankBalance: 9876543210987n,
          karma: 9999,
          serverRank: 99999,
          globalRank: 100000,
        });

        expect(buffer.length).toBeGreaterThan(1000);
      }
    });
  });

  describe('renderFromRepositories (end-to-end repository integration)', () => {
    let client: SqliteDatabaseClient;
    let userRepo: UserRepository;
    let economyRepo: EconomyRepository;
    let xpRepo: XpRepository;
    let guildSettingsRepo: GuildSettingsRepository;
    let leaderboardRepo: LeaderboardRepository;
    let levelingService: LevelingService;
    let leaderboardService: LeaderboardService;
    let integratedRenderer: ProfileCardRenderer;

    beforeEach(async () => {
      const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
      if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
      client = rawClient;

      // Create database schema
      client.raw.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          display_name TEXT,
          avatar_url TEXT,
          profile_background_url TEXT,
          is_blacklisted INTEGER NOT NULL DEFAULT 0,
          warn_count INTEGER NOT NULL DEFAULT 0,
          notify_level_up INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE economy_balances (
          user_id TEXT PRIMARY KEY,
          wallet_balance INTEGER NOT NULL DEFAULT 0,
          bank_balance INTEGER NOT NULL DEFAULT 0,
          bank_capacity INTEGER NOT NULL DEFAULT 10000,
          net_worth INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE xp_accounts (
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          xp INTEGER NOT NULL DEFAULT 0,
          level INTEGER NOT NULL DEFAULT 0,
          total_xp INTEGER NOT NULL DEFAULT 0,
          karma INTEGER NOT NULL DEFAULT 0,
          last_xp_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, guild_id)
        );

        CREATE TABLE guild_settings (
          guild_id TEXT PRIMARY KEY,
          prefix TEXT NOT NULL DEFAULT '!',
          locale TEXT NOT NULL DEFAULT 'en-US',
          timezone TEXT NOT NULL DEFAULT 'UTC',
          ai_channel_id TEXT,
          log_channel_id TEXT,
          escalation_steps TEXT,
          welcome_channel_id TEXT,
          welcome_message TEXT,
          leave_channel_id TEXT,
          leave_message TEXT,
          autorole_id TEXT,
          moderation_log_channel_id TEXT,
          muted_role_id TEXT,
          disabled_modules TEXT DEFAULT '[]',
          disabled_commands TEXT DEFAULT '[]',
          karma_notifications_enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
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

      userRepo = new UserRepository(client);
      economyRepo = new EconomyRepository(client);
      xpRepo = new XpRepository(client);
      guildSettingsRepo = new GuildSettingsRepository(client);
      leaderboardRepo = new LeaderboardRepository(client);

      const eventBus = new EventBus();
      levelingService = new LevelingService({
        xpRepository: xpRepo,
        userRepository: userRepo,
        guildSettingsRepository: guildSettingsRepo,
        eventBus,
      });

      leaderboardService = new LeaderboardService({
        xpRepository: xpRepo,
        leaderboardRepository: leaderboardRepo,
      });

      integratedRenderer = new ProfileCardRenderer({
        userRepository: userRepo,
        economyRepository: economyRepo,
        levelingService,
        leaderboardService,
      });
    });

    it('should fetch user data, compute progress, and synthesize profile card', async () => {
      const userId = 'user_integrated_01';
      const guildId = 'guild_integrated_01';

      // Seed user
      await userRepo.create({
        id: userId,
        username: 'KuroNeko',
        displayName: 'Kuro Neko',
        notifyLevelUp: true,
      });

      // Seed economy balance
      await economyRepo.create({
        userId,
        walletBalance: 2500,
        bankBalance: 18000,
        bankCapacity: 50000,
        netWorth: 20500,
      });

      // Seed XP account & Karma
      await xpRepo.create({
        userId,
        guildId,
        xp: 1500,
        level: 4,
        karma: 25,
      });

      // Materialize leaderboard
      await leaderboardService.materializeGuild(guildId);

      const buffer = await integratedRenderer.renderFromRepositories(userId, guildId, {
        presenceStatus: 'online',
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      const dims = parseImageDimensions(buffer);
      expect(dims).toEqual({
        width: 1200,
        height: 400,
        format: 'png',
      });
    });
  });
});
