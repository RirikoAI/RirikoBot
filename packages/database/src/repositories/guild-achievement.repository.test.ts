import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { WaifuGuildRepository } from './waifu-guild.repository.js';
import { AchievementRepository } from './achievement.repository.js';
import { TcgConfigRepository } from './tcg-config.repository.js';

describe('Guild, Achievement & TcgConfig Repositories (TASK-1052)', () => {
  let client: SqliteDatabaseClient;
  let guildRepo: WaifuGuildRepository;
  let achievementRepo: AchievementRepository;
  let configRepo: TcgConfigRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Create tables in memory
    client.raw.exec(`
      CREATE TABLE waifu_guilds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        leader_user_id TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        guild_xp INTEGER NOT NULL DEFAULT 0,
        guild_bank INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE waifu_guild_members (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        rank TEXT NOT NULL DEFAULT 'MEMBER',
        contribution_xp INTEGER NOT NULL DEFAULT 0,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (guild_id, user_id)
      );

      CREATE TABLE game_achievements (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'BRONZE',
        requirement_type TEXT NOT NULL,
        requirement_target INTEGER NOT NULL DEFAULT 1,
        reward_xp INTEGER NOT NULL DEFAULT 0,
        reward_credits INTEGER NOT NULL DEFAULT 0,
        reward_card_id TEXT,
        reward_item_id TEXT,
        reward_consumables TEXT DEFAULT '{}',
        reward_title TEXT,
        badge_icon TEXT,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE user_achievements (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        is_unlocked INTEGER NOT NULL DEFAULT 0,
        is_claimed INTEGER NOT NULL DEFAULT 0,
        unlocked_at INTEGER,
        claimed_at INTEGER
      );
      CREATE INDEX idx_user_achievements_user_claimed ON user_achievements (user_id, is_claimed);

      CREATE TABLE tcg_system_configs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    guildRepo = new WaifuGuildRepository(client);
    achievementRepo = new AchievementRepository(client);
    configRepo = new TcgConfigRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('WaifuGuildRepository', () => {
    it('creates and manages waifu guilds and members', async () => {
      const guild = await guildRepo.create({
        name: 'Starlight Order',
        leaderUserId: 'leader-1',
      });

      expect(guild.id).toBeDefined();
      expect(guild.name).toBe('Starlight Order');
      expect(guild.level).toBe(1);

      // Add leader as member
      await guildRepo.addMember({
        guildId: guild.id,
        userId: 'leader-1',
        rank: 'LEADER',
      });

      // Add normal member
      await guildRepo.addMember({
        guildId: guild.id,
        userId: 'member-1',
        rank: 'MEMBER',
      });

      expect(await guildRepo.countMembers(guild.id)).toBe(2);

      const userGuild = await guildRepo.findUserGuild('member-1');
      expect(userGuild).not.toBeNull();
      expect(userGuild?.guild.name).toBe('Starlight Order');
      expect(userGuild?.member.rank).toBe('MEMBER');

      // Update XP & Bank
      const updatedXp = await guildRepo.addGuildXp(guild.id, 500);
      expect(updatedXp.guildXp).toBe(500);

      const updatedBank = await guildRepo.modifyGuildBank(guild.id, 1000);
      expect(updatedBank.guildBank).toBe(1000);

      // Add contribution XP
      const member = await guildRepo.addContributionXp(guild.id, 'member-1', 250);
      expect(member.contributionXp).toBe(250);

      // Update rank
      const promoted = await guildRepo.updateMemberRank(guild.id, 'member-1', 'OFFICER');
      expect(promoted.rank).toBe('OFFICER');

      // Remove member
      const removed = await guildRepo.removeMember(guild.id, 'member-1');
      expect(removed).toBe(true);
      expect(await guildRepo.countMembers(guild.id)).toBe(1);
    });
  });

  describe('AchievementRepository', () => {
    it('creates, tracks progress, and claims achievements', async () => {
      const ach = await achievementRepo.create({
        code: 'COLL_INITIATE',
        title: 'Card Initiate',
        description: 'Collect 10 cards',
        category: 'COLLECTOR',
        tier: 'BRONZE',
        requirementType: 'CARD_COUNT',
        requirementTarget: 10,
        rewardXp: 500,
        rewardCredits: 1000,
      });

      expect(ach.id).toBeDefined();
      expect(ach.code).toBe('COLL_INITIATE');

      const byCode = await achievementRepo.findByCode('COLL_INITIATE');
      expect(byCode?.id).toBe(ach.id);

      // Track user progress
      const userAch = await achievementRepo.updateProgress('user-1', ach.id, 5, false);
      expect(userAch.progress).toBe(5);
      expect(userAch.isUnlocked).toBe(false);

      // Complete progress
      const completed = await achievementRepo.updateProgress('user-1', ach.id, 10, true);
      expect(completed.progress).toBe(10);
      expect(completed.isUnlocked).toBe(true);

      // Claim reward
      const claimed = await achievementRepo.claimReward(completed.id);
      expect(claimed.isClaimed).toBe(true);
      expect(claimed.claimedAt).toBeInstanceOf(Date);

      // List user achievements
      const userList = await achievementRepo.listUserAchievements('user-1', { isClaimed: true });
      expect(userList.length).toBe(1);
      expect(userList[0]?.achievement.code).toBe('COLL_INITIATE');
    });
  });

  describe('TcgConfigRepository', () => {
    it('stores, updates, and retrieves global configs', async () => {
      await configRepo.setConfig('global_max_energy_cap', 350, 'admin-1');
      const maxCap = await configRepo.getConfig<number>('global_max_energy_cap');
      expect(maxCap).toBe(350);

      await configRepo.setConfig('dungeon_scaling_model', 'EXPONENTIAL', 'admin-1');
      const model = await configRepo.getConfig<string>('dungeon_scaling_model');
      expect(model).toBe('EXPONENTIAL');

      const all = await configRepo.getAllConfigs();
      expect(all['global_max_energy_cap']).toBe(350);
      expect(all['dungeon_scaling_model']).toBe('EXPONENTIAL');
    });
  });
});
