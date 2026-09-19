import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  WaifuGuildRepository,
  AchievementRepository,
  TcgConfigRepository,
  EconomyRepository,
  XpRepository,
  UserInventoryItemRepository,
  GameItemRepository,
} from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import { WaifuGuildService } from '../guild/waifu-guild.service.js';
import { AchievementService } from '../achievements/achievement-service.js';
import { TcgConfigService } from '../admin/tcg-config.service.js';
import { CANONICAL_ITEMS } from '../equipment/catalog.js';

describe('Guild, Achievements & TcgConfig Services (TASK-1052)', () => {
  let client: SqliteDatabaseClient;
  let guildRepo: WaifuGuildRepository;
  let achievementRepo: AchievementRepository;
  let configRepo: TcgConfigRepository;
  let economyRepo: EconomyRepository;
  let xpRepo: XpRepository;
  let inventoryRepo: UserInventoryItemRepository;
  let itemRepo: GameItemRepository;

  let guildService: WaifuGuildService;
  let achievementService: AchievementService;
  let configService: TcgConfigService;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Create required tables in memory
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

      CREATE TABLE economy_balances (
        user_id TEXT PRIMARY KEY,
        wallet_balance INTEGER NOT NULL DEFAULT 0,
        bank_balance INTEGER NOT NULL DEFAULT 0,
        bank_capacity INTEGER NOT NULL DEFAULT 10000,
        net_worth INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE economy_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CREDITS',
        balance_before INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        source TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_economy_tx_user_created ON economy_transactions (user_id, created_at);

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

      CREATE TABLE user_inventory_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        enhancement_level INTEGER NOT NULL DEFAULT 0,
        equipped_to_card_id TEXT,
        slot TEXT NOT NULL DEFAULT 'NONE',
        state TEXT NOT NULL DEFAULT 'IDLE',
        obtained_from TEXT NOT NULL DEFAULT 'SHOP',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE game_items (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        subtype TEXT NOT NULL,
        rarity TEXT NOT NULL DEFAULT 'COMMON',
        base_stats TEXT DEFAULT '{}',
        battle_perks TEXT DEFAULT '[]',
        consumable_effect TEXT DEFAULT '{}',
        is_shop_buyable INTEGER NOT NULL DEFAULT 1,
        shop_price INTEGER NOT NULL DEFAULT 100,
        max_daily_purchases INTEGER NOT NULL DEFAULT 5,
        is_tradeable INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
    `);

    guildRepo = new WaifuGuildRepository(client);
    achievementRepo = new AchievementRepository(client);
    configRepo = new TcgConfigRepository(client);
    economyRepo = new EconomyRepository(client);
    xpRepo = new XpRepository(client);
    inventoryRepo = new UserInventoryItemRepository(client);
    itemRepo = new GameItemRepository(client);
    for (const item of CANONICAL_ITEMS) await itemRepo.create(item);

    guildService = new WaifuGuildService(guildRepo, economyRepo, client);
    achievementService = new AchievementService(achievementRepo, economyRepo, client, {
      xpRepo,
      inventoryRepo,
      itemRepo,
    });
    configService = new TcgConfigService(configRepo);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('WaifuGuildService', () => {
    it('enforces creation fee, creates guild, handles members, XP leveling, and bank deposits', async () => {
      // 1. Rejects creation with insufficient credits
      await economyRepo.modifyBalance({
        userId: 'user-leader',
        walletDelta: 2000,
        type: 'TEST_CREDIT',
        source: 'TEST',
      });
      await expect(
        guildService.createGuild({ name: 'Phoenix Covenant', leaderUserId: 'user-leader' }),
      ).rejects.toThrow(/requires 5,000 Credits/);

      // 2. Add enough credits and create
      await economyRepo.modifyBalance({
        userId: 'user-leader',
        walletDelta: 10000,
        type: 'TEST_CREDIT',
        source: 'TEST',
      }); // balance now 12,000
      const guild = await guildService.createGuild({
        name: 'Phoenix Covenant',
        leaderUserId: 'user-leader',
      });

      expect(guild.id).toBeDefined();
      expect(guild.name).toBe('Phoenix Covenant');
      expect(guild.level).toBe(1);

      // Wallet should have 7,000 remaining (12,000 - 5,000)
      const balAfter = await economyRepo.findById('user-leader');
      expect(balAfter?.walletBalance).toBe(7000);

      // Leader cannot create another guild
      await expect(
        guildService.createGuild({ name: 'Second Guild', leaderUserId: 'user-leader' }),
      ).rejects.toThrow(/already a member/);

      // 3. Member joins
      const member = await guildService.joinGuild('user-member', 'Phoenix Covenant');
      expect(member.rank).toBe('MEMBER');

      const details = await guildService.getGuildDetails(guild.id);
      expect(details.memberCount).toBe(2);
      expect(details.maxMembers).toBe(12); // 10 + 1 * 2

      // 4. Deposit credits to guild bank
      await economyRepo.modifyBalance({
        userId: 'user-member',
        walletDelta: 3000,
        type: 'TEST_CREDIT',
        source: 'TEST',
      });
      const depositRes = await guildService.depositCredits('user-member', 1500);
      expect(depositRes.newGuildBank).toBe(1500);
      expect(depositRes.remainingWallet).toBe(1500);

      // 5. Member earns battle XP, leveling up guild
      // Required XP for level 1: floor(1000 * 1^1.5) = 1000
      const xpRes = await guildService.recordBattleXp('user-member', 1200);
      expect(xpRes?.guildLeveledUp).toBe(true);
      expect(xpRes?.newLevel).toBe(2);

      const updatedDetails = await guildService.getGuildDetails(guild.id);
      expect(updatedDetails.guild.level).toBe(2);
      expect(updatedDetails.guild.guildXp).toBe(200); // 1200 - 1000 = 200 carry-over
      expect(updatedDetails.maxMembers).toBe(14); // 10 + 2 * 2

      // 6. Promote member
      const promoted = await guildService.updateMemberRank(
        'user-leader',
        'user-member',
        'OFFICER',
      );
      expect(promoted.rank).toBe('OFFICER');

      // 7. Member leaves
      const leaveRes = await guildService.leaveGuild('user-member');
      expect(leaveRes.disbanded).toBe(false);

      // Leader leaves (sole member left -> disbands)
      const leaderLeave = await guildService.leaveGuild('user-leader');
      expect(leaderLeave.disbanded).toBe(true);
    });
  });

  describe('AchievementService', () => {
    it('seeds achievements, tracks progress, and atomically dispatches multi-asset rewards', async () => {
      // 1. Seed achievements
      await achievementService.seedAchievements();
      const all = await achievementService.listAllAchievements();
      expect(all.length).toBeGreaterThanOrEqual(9);

      // 2. Record progress for COLL_INITIATE (target: 10 cards)
      const p1 = await achievementService.recordProgress('user-ach', 'CARD_COUNT', 5);
      expect(p1.length).toBeGreaterThan(0);
      expect(p1[0]?.justUnlocked).toBe(false);

      const p2 = await achievementService.recordProgress('user-ach', 'CARD_COUNT', 5);
      expect(p2[0]?.justUnlocked).toBe(true);

      // 3. Claim achievement rewards (500 XP, 1000 Credits, 2x Minor HP Potion)
      const claim = await achievementService.claimAchievement('user-ach', 'COLL_INITIATE');
      expect(claim.rewardsDispatched.credits).toBe(1000);
      expect(claim.rewardsDispatched.exp).toBe(500);
      expect(claim.rewardsDispatched.consumables['Minor HP Potion']).toBe(2);
      const minorHp = await itemRepo.findByCode('POTION_MINOR_HP');
      const potionRows = await inventoryRepo.findByUser('user-ach');
      expect(potionRows.find((r) => r.itemId === minorHp!.id)?.quantity).toBe(2);

      const bal = await economyRepo.findById('user-ach');
      expect(bal?.walletBalance).toBe(1000);

      // 4. Double claim prevention
      await expect(
        achievementService.claimAchievement('user-ach', 'COLL_INITIATE'),
      ).rejects.toThrow(/already been claimed/);

      // 5. Test claimAll
      // Unlock another achievement: TUTORIAL_CLEARED target 4
      await achievementService.recordProgress('user-ach', 'TUTORIAL_CLEARED', 4);
      const batchClaim = await achievementService.claimAll('user-ach');
      expect(batchClaim.length).toBe(1);
      expect(batchClaim[0]?.achievement.code).toBe('TUTORIAL_COMPLETE');
    });
  });

  describe('TcgConfigService', () => {
    it('retrieves defaults, validates inputs with Zod, and updates settings', async () => {
      // 1. Default config
      const defaultCap = await configService.getConfig('global_max_energy_cap');
      expect(defaultCap).toBe(300);

      const defaultModel = await configService.getConfig('dungeon_scaling_model');
      expect(defaultModel).toBe('HYBRID');

      // 2. Set valid value
      await configService.setConfig('global_max_energy_cap', 450, 'admin-user');
      const updatedCap = await configService.getConfig('global_max_energy_cap');
      expect(updatedCap).toBe(450);

      // 3. Rejects invalid value
      await expect(
        configService.setConfig('global_max_energy_cap', 50, 'admin-user'), // min is 100
      ).rejects.toThrow();

      // 4. Authorization checks
      await configService.setConfig('tcg_manager_role_id', 'role-mod-123', 'admin-user');

      const isAuthAdmin = await configService.isAuthorized({ isServerAdmin: true });
      expect(isAuthAdmin).toBe(true);

      const isAuthRole = await configService.isAuthorized({ memberRoles: ['role-mod-123'] });
      expect(isAuthRole).toBe(true);

      const isAuthOther = await configService.isAuthorized({ memberRoles: ['other-role'] });
      expect(isAuthOther).toBe(false);
    });
  });
});
