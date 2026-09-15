import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { UserRepository } from './user.repository.js';
import { GuildSettingsRepository } from './guild-settings.repository.js';
import { EconomyRepository } from './economy.repository.js';
import { XpRepository } from './xp.repository.js';

describe('Core Domain Repositories & ACID Financial Ledger', () => {
  let client: SqliteDatabaseClient;
  let userRepo: UserRepository;
  let guildSettingsRepo: GuildSettingsRepository;
  let economyRepo: EconomyRepository;
  let xpRepo: XpRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Create normalized tables needed for tests
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

    userRepo = new UserRepository(client);
    guildSettingsRepo = new GuildSettingsRepository(client);
    economyRepo = new EconomyRepository(client);
    xpRepo = new XpRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('UserRepository', () => {
    it('creates, reads, updates, and deletes users', async () => {
      expect(await userRepo.count()).toBe(0);

      const created = await userRepo.create({
        id: 'user_100',
        username: 'RirikoMaster',
        displayName: 'Master',
        avatarUrl: 'https://example.com/avatar.png',
      });

      expect(created.id).toBe('user_100');
      expect(created.username).toBe('RirikoMaster');
      expect(created.isBlacklisted).toBe(false);
      expect(await userRepo.exists('user_100')).toBe(true);
      expect(await userRepo.count()).toBe(1);

      const fetched = await userRepo.findById('user_100');
      expect(fetched?.displayName).toBe('Master');

      const updated = await userRepo.update('user_100', { displayName: 'Supreme Master' });
      expect(updated.displayName).toBe('Supreme Master');

      await userRepo.incrementWarnCount('user_100');
      const warned = await userRepo.findById('user_100');
      expect(warned?.warnCount).toBe(1);

      await userRepo.setBlacklist('user_100', true, 'Spamming');
      const blacklisted = await userRepo.findById('user_100');
      expect(blacklisted?.isBlacklisted).toBe(true);

      const upserted = await userRepo.upsert({
        id: 'user_100',
        username: 'RirikoMasterUpdated',
      });
      expect(upserted.username).toBe('RirikoMasterUpdated');

      const deleted = await userRepo.delete('user_100');
      expect(deleted).toBe(true);
      expect(await userRepo.exists('user_100')).toBe(false);
    });
  });

  describe('GuildSettingsRepository', () => {
    it('handles guild settings lifecycle and defaults', async () => {
      const settings = await guildSettingsRepo.getOrCreate('guild_abc', { prefix: '?' });
      expect(settings.guildId).toBe('guild_abc');
      expect(settings.prefix).toBe('?');
      expect(settings.locale).toBe('en-US');

      const byId = await guildSettingsRepo.getByGuildId('guild_abc');
      expect(byId?.prefix).toBe('?');

      const updated = await guildSettingsRepo.setPrefix('guild_abc', 'r!');
      expect(updated.prefix).toBe('r!');

      const count = await guildSettingsRepo.count();
      expect(count).toBe(1);

      const deleted = await guildSettingsRepo.delete('guild_abc');
      expect(deleted).toBe(true);
      expect(await guildSettingsRepo.exists('guild_abc')).toBe(false);
    });
  });

  describe('EconomyRepository & Double-Entry Ledger', () => {
    it('initializes zero balance with bank capacity', async () => {
      const balance = await economyRepo.getOrCreateBalance('user_e1', 50000);
      expect(balance.userId).toBe('user_e1');
      expect(balance.walletBalance).toBe(0);
      expect(balance.bankBalance).toBe(0);
      expect(balance.bankCapacity).toBe(50000);
      expect(balance.netWorth).toBe(0);
    });

    it('modifies balance and logs immutable transaction', async () => {
      const result = await economyRepo.modifyBalance({
        userId: 'user_e1',
        walletDelta: 500,
        type: 'DAILY',
        source: 'DAILY_COMMAND',
        metadata: { streak: 1 },
      });

      expect(result.balance.walletBalance).toBe(500);
      expect(result.balance.netWorth).toBe(500);
      expect(result.transaction.type).toBe('DAILY');
      expect(result.transaction.amount).toBe(500);
      expect(result.transaction.balanceBefore).toBe(0);
      expect(result.transaction.balanceAfter).toBe(500);
      expect(result.transaction.source).toBe('DAILY_COMMAND');

      const history = await economyRepo.getTransactionHistory('user_e1');
      expect(history.total).toBe(1);
      expect(history.items[0]?.type).toBe('DAILY');
    });

    it('rejects mutations that cause negative balances', async () => {
      await economyRepo.modifyBalance({
        userId: 'user_broke',
        walletDelta: 100,
        type: 'REWARD',
        source: 'INITIAL',
      });

      await expect(
        economyRepo.modifyBalance({
          userId: 'user_broke',
          walletDelta: -200,
          type: 'SHOP_BUY',
          source: 'SHOP',
        }),
      ).rejects.toThrow('Insufficient wallet balance');

      // Balance remains unchanged
      const current = await economyRepo.findById('user_broke');
      expect(current?.walletBalance).toBe(100);
    });

    it('handles deposits and withdrawals with bank capacity enforcement', async () => {
      // Give wallet 1000 credits (default bank capacity is 10000)
      await economyRepo.modifyBalance({
        userId: 'user_banker',
        walletDelta: 1000,
        type: 'REWARD',
        source: 'TEST',
      });

      // Deposit 600
      const depositResult = await economyRepo.deposit('user_banker', 600);
      expect(depositResult.balance.walletBalance).toBe(400);
      expect(depositResult.balance.bankBalance).toBe(600);
      expect(depositResult.balance.netWorth).toBe(1000);

      // Withdraw 200
      const withdrawResult = await economyRepo.withdraw('user_banker', 200);
      expect(withdrawResult.balance.walletBalance).toBe(600);
      expect(withdrawResult.balance.bankBalance).toBe(400);

      // Try depositing more than capacity
      await economyRepo.modifyBalance({
        userId: 'user_banker',
        walletDelta: 20000,
        type: 'ADMIN',
        source: 'TEST',
      });

      await expect(economyRepo.deposit('user_banker', 15000)).rejects.toThrow(
        'Bank capacity exceeded',
      );
    });

    it('executes atomic balance transfer between users with double-entry ledger', async () => {
      // Alice has 1000, Bob has 200
      await economyRepo.modifyBalance({
        userId: 'alice',
        walletDelta: 1000,
        type: 'INITIAL',
        source: 'SETUP',
      });
      await economyRepo.modifyBalance({
        userId: 'bob',
        walletDelta: 200,
        type: 'INITIAL',
        source: 'SETUP',
      });

      const transfer = await economyRepo.transferBalance({
        fromUserId: 'alice',
        toUserId: 'bob',
        amount: 350,
        source: 'PAY_COMMAND',
      });

      expect(transfer.fromBalance.walletBalance).toBe(650);
      expect(transfer.toBalance.walletBalance).toBe(550);

      expect(transfer.debitTransaction.userId).toBe('alice');
      expect(transfer.debitTransaction.type).toBe('TRANSFER');
      expect(transfer.debitTransaction.amount).toBe(350);

      expect(transfer.creditTransaction.userId).toBe('bob');
      expect(transfer.creditTransaction.type).toBe('TRANSFER');
      expect(transfer.creditTransaction.amount).toBe(350);

      // Verify transaction histories
      const aliceHistory = await economyRepo.getTransactionHistory('alice');
      expect(aliceHistory.total).toBe(2); // INITIAL + TRANSFER

      const bobHistory = await economyRepo.getTransactionHistory('bob');
      expect(bobHistory.total).toBe(2); // INITIAL + TRANSFER
    });

    it('rolls back transfer atomically if sender lacks sufficient funds', async () => {
      // Alice has 100, Bob has 50
      await economyRepo.modifyBalance({
        userId: 'alice_broke',
        walletDelta: 100,
        type: 'INITIAL',
        source: 'SETUP',
      });
      await economyRepo.modifyBalance({
        userId: 'bob_safe',
        walletDelta: 50,
        type: 'INITIAL',
        source: 'SETUP',
      });

      // Attempt to transfer 250 (Alice only has 100)
      await expect(
        economyRepo.transferBalance({
          fromUserId: 'alice_broke',
          toUserId: 'bob_safe',
          amount: 250,
          source: 'PAY_COMMAND',
        }),
      ).rejects.toThrow('Insufficient wallet balance');

      // Verify NEITHER balance was changed
      const alice = await economyRepo.findById('alice_broke');
      const bob = await economyRepo.findById('bob_safe');

      expect(alice?.walletBalance).toBe(100);
      expect(bob?.walletBalance).toBe(50);
    });
  });

  describe('XpRepository', () => {
    it('creates, retrieves, and updates XP accounts', async () => {
      const account = await xpRepo.getOrCreateAccount('user_xp_1', 'guild_1');
      expect(account.userId).toBe('user_xp_1');
      expect(account.guildId).toBe('guild_1');
      expect(account.xp).toBe(0);
      expect(account.level).toBe(0);
      expect(account.karma).toBe(0);

      const updated = await xpRepo.updateAccount('user_xp_1', 'guild_1', {
        level: 2,
        karma: 15,
      });
      expect(updated.level).toBe(2);
      expect(updated.karma).toBe(15);
    });

    it('adds XP atomically and logs XP events', async () => {
      const result = await xpRepo.addXp({
        userId: 'user_xp_2',
        guildId: 'guild_1',
        xpDelta: 150,
        source: 'MESSAGE',
        newLevel: 1,
      });

      expect(result.account.xp).toBe(150);
      expect(result.account.level).toBe(1);
      expect(result.event.id).toBeDefined();
      expect(result.event.xpAwarded).toBe(150);
      expect(result.event.source).toBe('MESSAGE');
    });

    it('adjusts and sets karma', async () => {
      await xpRepo.addKarma('user_karma_1', 'guild_1', 10);
      let account = await xpRepo.getAccount('user_karma_1', 'guild_1');
      expect(account?.karma).toBe(10);

      await xpRepo.addKarma('user_karma_1', 'guild_1', 5);
      account = await xpRepo.getAccount('user_karma_1', 'guild_1');
      expect(account?.karma).toBe(15);

      await xpRepo.setKarma('user_karma_1', 'guild_1', 50);
      account = await xpRepo.getAccount('user_karma_1', 'guild_1');
      expect(account?.karma).toBe(50);
    });

    it('retrieves paginated guild leaderboards ordered by XP descending', async () => {
      await xpRepo.addXp({ userId: 'u1', guildId: 'guild_lead', xpDelta: 100, source: 'TEST' });
      await xpRepo.addXp({ userId: 'u2', guildId: 'guild_lead', xpDelta: 500, source: 'TEST' });
      await xpRepo.addXp({ userId: 'u3', guildId: 'guild_lead', xpDelta: 300, source: 'TEST' });

      const leaderboard = await xpRepo.getLeaderboard('guild_lead', { limit: 10, offset: 0 });
      expect(leaderboard.total).toBe(3);
      expect(leaderboard.items).toHaveLength(3);
      expect(leaderboard.items[0]?.userId).toBe('u2');
      expect(leaderboard.items[1]?.userId).toBe('u3');
      expect(leaderboard.items[2]?.userId).toBe('u1');
    });
  });
});
