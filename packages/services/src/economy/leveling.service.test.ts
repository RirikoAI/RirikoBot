import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  XpRepository,
  UserRepository,
  GuildSettingsRepository,
  EconomyRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { EventBus } from '@ririko/core';
import { LevelingService } from './leveling.service.js';
import { BankingService } from './banking.service.js';
import type { LevelUpEvent } from './types.js';

describe('LevelingService', () => {
  let client: SqliteDatabaseClient;
  let xpRepo: XpRepository;
  let userRepo: UserRepository;
  let guildSettingsRepo: GuildSettingsRepository;
  let economyRepo: EconomyRepository;
  let bankingService: BankingService;
  let eventBus: EventBus;
  let levelingService: LevelingService;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Create required SQLite schema
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
      CREATE TABLE guild_settings (
        guild_id TEXT PRIMARY KEY,
        prefix TEXT NOT NULL DEFAULT '!',
        locale TEXT NOT NULL DEFAULT 'en-US',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        ai_channel_id TEXT,
        log_channel_id TEXT,
        music_channel_id TEXT,
        welcomer_channel_id TEXT,
        welcomer_enabled INTEGER NOT NULL DEFAULT 0,
        welcomer_bg TEXT,
        farewell_channel_id TEXT,
        farewell_enabled INTEGER NOT NULL DEFAULT 0,
        farewell_bg TEXT,
        karma_notifications_enabled INTEGER NOT NULL DEFAULT 1,
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
    `);

    xpRepo = new XpRepository(client);
    userRepo = new UserRepository(client);
    guildSettingsRepo = new GuildSettingsRepository(client);
    economyRepo = new EconomyRepository(client);
    eventBus = new EventBus();

    bankingService = new BankingService({
      repository: economyRepo,
      baseCapacity: 10000,
      capacityPerLevel: 2500,
    });

    levelingService = new LevelingService({
      xpRepository: xpRepo,
      userRepository: userRepo,
      guildSettingsRepository: guildSettingsRepo,
      bankingService,
      eventBus,
    });
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Mathematical Progression Formulas', () => {
    it('calculates Delta XP for next level using 5L^2 + 50L + 100', () => {
      // Level 0: 5(0) + 50(0) + 100 = 100
      expect(levelingService.getXpForLevel(0)).toBe(100);
      // Level 1: 5(1) + 50(1) + 100 = 155
      expect(levelingService.getXpForLevel(1)).toBe(155);
      // Level 2: 5(4) + 50(2) + 100 = 220
      expect(levelingService.getXpForLevel(2)).toBe(220);
      // Level 5: 5(25) + 50(5) + 100 = 125 + 250 + 100 = 475
      expect(levelingService.getXpForLevel(5)).toBe(475);
      // Level 10: 5(100) + 50(10) + 100 = 500 + 500 + 100 = 1100
      expect(levelingService.getXpForLevel(10)).toBe(1100);
    });

    it('calculates closed-form Total Cumulative XP for any given level', () => {
      // Level 0 requires 0 total XP
      expect(levelingService.getTotalXpForLevel(0)).toBe(0);
      // Level 1 requires 100 total XP
      expect(levelingService.getTotalXpForLevel(1)).toBe(100);
      // Level 2 requires 100 + 155 = 255 total XP
      expect(levelingService.getTotalXpForLevel(2)).toBe(255);
      // Level 3 requires 255 + 220 = 475 total XP
      expect(levelingService.getTotalXpForLevel(3)).toBe(475);
      // Level 4 requires 475 + (5*9 + 150 + 100) = 475 + 295 = 770
      expect(levelingService.getTotalXpForLevel(4)).toBe(770);
      // Level 5 requires 770 + (5*16 + 200 + 100) = 770 + 380 = 1150
      expect(levelingService.getTotalXpForLevel(5)).toBe(1150);
    });

    it('bidirectionally computes LevelProgress from total XP', () => {
      // 0 XP -> Level 0
      const prog0 = levelingService.getLevelProgress(0);
      expect(prog0.level).toBe(0);
      expect(prog0.currentLevelXp).toBe(0);
      expect(prog0.xpForNextLevel).toBe(100);
      expect(prog0.progressPercent).toBe(0);

      // 50 XP -> Level 0, 50%
      const prog50 = levelingService.getLevelProgress(50);
      expect(prog50.level).toBe(0);
      expect(prog50.currentLevelXp).toBe(50);
      expect(prog50.xpForNextLevel).toBe(100);
      expect(prog50.progressPercent).toBe(50);

      // Exactly 100 XP -> Level 1, 0%
      const prog100 = levelingService.getLevelProgress(100);
      expect(prog100.level).toBe(1);
      expect(prog100.currentLevelXp).toBe(0);
      expect(prog100.xpForNextLevel).toBe(155);
      expect(prog100.progressPercent).toBe(0);

      // 200 XP -> Level 1 (100 XP within level 1 of 155)
      const prog200 = levelingService.getLevelProgress(200);
      expect(prog200.level).toBe(1);
      expect(prog200.currentLevelXp).toBe(100);
      expect(prog200.xpForNextLevel).toBe(155);
      expect(prog200.progressPercent).toBe(64.52);

      // Exactly 255 XP -> Level 2
      const prog255 = levelingService.getLevelProgress(255);
      expect(prog255.level).toBe(2);
      expect(prog255.currentLevelXp).toBe(0);
      expect(prog255.xpForNextLevel).toBe(220);
      expect(prog255.progressPercent).toBe(0);
    });
  });

  describe('addExperience & Level-Up Events', () => {
    it('awards XP within same level without triggering level-up event', async () => {
      let eventFired = false;
      eventBus.on('leveling:levelUp', () => {
        eventFired = true;
      });

      const result = await levelingService.addExperience(
        'user_1',
        'guild_1',
        50,
        'CHAT_MESSAGE',
      );

      expect(result.xpAdded).toBe(50);
      expect(result.totalXp).toBe(50);
      expect(result.didLevelUp).toBe(false);
      expect(result.previousLevel).toBe(0);
      expect(result.newLevel).toBe(0);
      expect(result.levelsGained).toBe(0);
      expect(result.progress.progressPercent).toBe(50);
      expect(eventFired).toBe(false);

      const account = await xpRepo.getAccount('user_1', 'guild_1');
      expect(account?.xp).toBe(50);
      expect(account?.level).toBe(0);
    });

    it('triggers LEVEL_UP event and syncs bank capacity on level threshold crossing', async () => {
      const events: LevelUpEvent[] = [];
      eventBus.on('leveling:levelUp', (evt) => {
        events.push(evt);
      });

      // Award 120 XP (crosses 100 XP threshold for Level 1)
      const result = await levelingService.addExperience(
        'user_levelup',
        'guild_1',
        120,
        'CHAT_MESSAGE',
      );

      expect(result.didLevelUp).toBe(true);
      expect(result.previousLevel).toBe(0);
      expect(result.newLevel).toBe(1);
      expect(result.levelsGained).toBe(1);
      expect(result.shouldNotify).toBe(true);

      expect(events).toHaveLength(1);
      expect(events[0]?.userId).toBe('user_levelup');
      expect(events[0]?.newLevel).toBe(1);
      expect(events[0]?.shouldNotify).toBe(true);

      // Verify bank capacity scaled: 10,000 + 1 * 2,500 = 12,500
      const balance = await economyRepo.findById('user_levelup');
      expect(balance?.bankCapacity).toBe(12500);
    });

    it('handles massive XP gain advancing multiple levels simultaneously', async () => {
      const events: LevelUpEvent[] = [];
      eventBus.on('leveling:levelUp', (evt) => {
        events.push(evt);
      });

      // Total XP for Level 4 is 770. Award 800 XP from level 0 -> reaches Level 4
      const result = await levelingService.addExperience(
        'user_multi',
        'guild_1',
        800,
        'QUEST_REWARD',
      );

      expect(result.didLevelUp).toBe(true);
      expect(result.previousLevel).toBe(0);
      expect(result.newLevel).toBe(4);
      expect(result.levelsGained).toBe(4);
      expect(events).toHaveLength(1);
      expect(events[0]?.levelsGained).toBe(4);

      // Bank capacity: 10,000 + 4 * 2,500 = 20,000
      const balance = await economyRepo.findById('user_multi');
      expect(balance?.bankCapacity).toBe(20000);
    });

    it('suppresses notification if user opted out of level-up notifications', async () => {
      // Create user with notifyLevelUp = false
      await userRepo.create({
        id: 'user_optout',
        username: 'quiet_user',
        notifyLevelUp: false,
      });

      const events: LevelUpEvent[] = [];
      eventBus.on('leveling:levelUp', (evt) => {
        events.push(evt);
      });

      const result = await levelingService.addExperience(
        'user_optout',
        'guild_1',
        100,
        'CHAT_MESSAGE',
      );

      expect(result.didLevelUp).toBe(true);
      expect(result.shouldNotify).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0]?.shouldNotify).toBe(false);
    });

    it('suppresses notification if server disabled karma notifications', async () => {
      // Create guild setting with karmaNotificationsEnabled = false
      await guildSettingsRepo.create({
        guildId: 'guild_optout',
        prefix: '!',
        karmaNotificationsEnabled: false,
      });

      const events: LevelUpEvent[] = [];
      eventBus.on('leveling:levelUp', (evt) => {
        events.push(evt);
      });

      const result = await levelingService.addExperience(
        'user_guild_optout',
        'guild_optout',
        100,
        'CHAT_MESSAGE',
      );

      expect(result.didLevelUp).toBe(true);
      expect(result.shouldNotify).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0]?.shouldNotify).toBe(false);
    });
  });

  describe('Karma Profile & Notification Management', () => {
    it('retrieves default karma profile and notification status', async () => {
      const profile = await levelingService.getKarmaProfile('user_karma', 'guild_1');

      expect(profile.userId).toBe('user_karma');
      expect(profile.guildId).toBe('guild_1');
      expect(profile.karma).toBe(0);
      expect(profile.userNotificationsEnabled).toBe(true);
      expect(profile.serverNotificationsEnabled).toBe(true);
    });

    it('awards and tracks karma adjustments', async () => {
      const newKarma = await levelingService.awardKarma('user_karma', 'guild_1', 25);
      expect(newKarma).toBe(25);

      const profile = await levelingService.getKarmaProfile('user_karma', 'guild_1');
      expect(profile.karma).toBe(25);
    });

    it('toggles user notifications via setUserNotifications', async () => {
      await userRepo.create({
        id: 'user_toggle',
        username: 'toggle_user',
        notifyLevelUp: true,
      });

      await levelingService.setUserNotifications('user_toggle', false);

      const profile = await levelingService.getKarmaProfile('user_toggle', 'guild_1');
      expect(profile.userNotificationsEnabled).toBe(false);
    });

    it('toggles server notifications via setServerNotifications', async () => {
      await guildSettingsRepo.create({
        guildId: 'guild_toggle',
        prefix: '!',
        karmaNotificationsEnabled: true,
      });

      await levelingService.setServerNotifications('guild_toggle', false);

      const profile = await levelingService.getKarmaProfile('user_test', 'guild_toggle');
      expect(profile.serverNotificationsEnabled).toBe(false);
    });
  });
});
