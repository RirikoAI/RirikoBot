import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_RESET_SCHEDULE, getResetDayKey } from '@ririko/core';
import { describeDialects } from '../testing/dialects.js';
import { UserRepository } from './user.repository.js';
import { GuildSettingsRepository } from './guild-settings.repository.js';
import { EconomyRepository } from './economy.repository.js';
import { XpRepository } from './xp.repository.js';
import { LeaderboardRepository } from './leaderboard.repository.js';
import { ItemRepository } from './item.repository.js';
import { ItemCategoryRepository } from './item-category.repository.js';
import { InventoryRepository } from './inventory.repository.js';
import { PlayerEnergyRepository } from './player-energy.repository.js';

describeDialects('Core Domain Repositories & ACID Financial Ledger', (db) => {
  let userRepo: UserRepository;
  let guildSettingsRepo: GuildSettingsRepository;
  let economyRepo: EconomyRepository;
  let xpRepo: XpRepository;
  let leaderboardRepo: LeaderboardRepository;
  let itemRepo: ItemRepository;
  let inventoryRepo: InventoryRepository;
  let playerEnergyRepo: PlayerEnergyRepository;

  beforeEach(() => {
    const client = db.client;
    userRepo = new UserRepository(client);
    guildSettingsRepo = new GuildSettingsRepository(client);
    economyRepo = new EconomyRepository(client);
    xpRepo = new XpRepository(client);
    leaderboardRepo = new LeaderboardRepository(client);
    itemRepo = new ItemRepository(client);
    inventoryRepo = new InventoryRepository(client);
    playerEnergyRepo = new PlayerEnergyRepository(client);
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

    it('gets existing user or creates a new one with defaults', async () => {
      const u1 = await userRepo.getOrCreate('user_auto_1', { username: 'AutoUser1' });
      expect(u1.id).toBe('user_auto_1');
      expect(u1.username).toBe('AutoUser1');

      const u1Again = await userRepo.getOrCreate('user_auto_1');
      expect(u1Again.id).toBe('user_auto_1');
      expect(u1Again.username).toBe('AutoUser1');

      const u2 = await userRepo.getOrCreate('user_auto_2');
      expect(u2.id).toBe('user_auto_2');
      expect(u2.username).toBe('user_user_auto_2');
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
      expect(Number(balance.walletBalance)).toBe(0);
      expect(Number(balance.bankBalance)).toBe(0);
      expect(Number(balance.bankCapacity)).toBe(50000);
      expect(Number(balance.netWorth)).toBe(0);
    });

    it('modifies balance and logs immutable transaction', async () => {
      const result = await economyRepo.modifyBalance({
        userId: 'user_e1',
        walletDelta: 500,
        type: 'DAILY',
        source: 'DAILY_COMMAND',
        metadata: { streak: 1 },
      });

      expect(Number(result.balance.walletBalance)).toBe(500);
      expect(Number(result.balance.netWorth)).toBe(500);
      expect(result.transaction.type).toBe('DAILY');
      expect(Number(result.transaction.amount)).toBe(500);
      expect(Number(result.transaction.balanceBefore)).toBe(0);
      expect(Number(result.transaction.balanceAfter)).toBe(500);
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
      expect(Number(current?.walletBalance)).toBe(100);
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
      expect(Number(depositResult.balance.walletBalance)).toBe(400);
      expect(Number(depositResult.balance.bankBalance)).toBe(600);
      expect(Number(depositResult.balance.netWorth)).toBe(1000);

      // Withdraw 200
      const withdrawResult = await economyRepo.withdraw('user_banker', 200);
      expect(Number(withdrawResult.balance.walletBalance)).toBe(600);
      expect(Number(withdrawResult.balance.bankBalance)).toBe(400);

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

      expect(Number(transfer.fromBalance.walletBalance)).toBe(650);
      expect(Number(transfer.toBalance.walletBalance)).toBe(550);

      expect(transfer.debitTransaction.userId).toBe('alice');
      expect(transfer.debitTransaction.type).toBe('TRANSFER');
      expect(Number(transfer.debitTransaction.amount)).toBe(350);

      expect(transfer.creditTransaction.userId).toBe('bob');
      expect(transfer.creditTransaction.type).toBe('TRANSFER');
      expect(Number(transfer.creditTransaction.amount)).toBe(350);

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

      expect(Number(alice?.walletBalance)).toBe(100);
      expect(Number(bob?.walletBalance)).toBe(50);
    });
  });

  describe('XpRepository', () => {
    it('creates, retrieves, and updates XP accounts', async () => {
      const account = await xpRepo.getOrCreateAccount('user_xp_1', 'guild_1');
      expect(account.userId).toBe('user_xp_1');
      expect(account.guildId).toBe('guild_1');
      expect(Number(account.xp)).toBe(0);
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

      expect(Number(result.account.xp)).toBe(150);
      expect(result.account.level).toBe(1);
      expect(result.event.id).toBeDefined();
      expect(Number(result.event.xpAwarded)).toBe(150);
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

    it('retrieves all accounts, distinct guilds, and global cumulative XP totals', async () => {
      await xpRepo.create({ userId: 'userA', guildId: 'g1', xp: 500, level: 3 });
      await xpRepo.create({ userId: 'userA', guildId: 'g2', xp: 200, level: 1 });
      await xpRepo.create({ userId: 'userB', guildId: 'g1', xp: 1000, level: 4 });

      const g1Accounts = await xpRepo.getAllGuildAccounts('g1');
      expect(g1Accounts).toHaveLength(2);
      expect(g1Accounts[0]?.userId).toBe('userB');
      expect(g1Accounts[1]?.userId).toBe('userA');

      const guilds = await xpRepo.getDistinctGuildIds();
      expect(guilds).toContain('g1');
      expect(guilds).toContain('g2');

      const globalTotals = await xpRepo.getGlobalUserXpTotals();
      expect(globalTotals[0]?.userId).toBe('userB'); // 1000 XP
      expect(globalTotals[0]?.totalXp).toBe(1000);
      expect(globalTotals[1]?.userId).toBe('userA'); // 500 + 200 = 700 XP
      expect(globalTotals[1]?.totalXp).toBe(700);

      // Test dynamic dense rank calculation
      const rankAInG1 = await xpRepo.getUserGuildRank('userA', 'g1');
      expect(rankAInG1?.rank).toBe(2);
      expect(rankAInG1?.totalUsers).toBe(2);

      const rankBInG1 = await xpRepo.getUserGuildRank('userB', 'g1');
      expect(rankBInG1?.rank).toBe(1);

      const rankAGlobal = await xpRepo.getUserGlobalRank('userA');
      expect(rankAGlobal?.rank).toBe(2);
      expect(rankAGlobal?.totalXp).toBe(700);

      const rankBGlobal = await xpRepo.getUserGlobalRank('userB');
      expect(rankBGlobal?.rank).toBe(1);
      expect(rankBGlobal?.totalXp).toBe(1000);
    });
  });

  describe('LeaderboardRepository', () => {
    it('creates, retrieves, and bulk-upserts leaderboard snapshots', async () => {
      const created = await leaderboardRepo.create({
        userId: 'user_snap_1',
        guildId: 'guild_snap',
        globalRank: 10,
        serverRank: 1,
      });

      expect(created.userId).toBe('user_snap_1');
      expect(created.serverRank).toBe(1);
      expect(created.globalRank).toBe(10);

      const pointLookup = await leaderboardRepo.getUserRank('user_snap_1', 'guild_snap');
      expect(pointLookup?.serverRank).toBe(1);
      expect(pointLookup?.globalRank).toBe(10);

      // Test bulk upsert (updating user_snap_1 and inserting user_snap_2)
      const count = await leaderboardRepo.upsertBatch([
        {
          userId: 'user_snap_1',
          guildId: 'guild_snap',
          globalRank: 12,
          serverRank: 2,
          calculatedAt: new Date(),
        },
        {
          userId: 'user_snap_2',
          guildId: 'guild_snap',
          globalRank: 5,
          serverRank: 1,
          calculatedAt: new Date(),
        },
      ]);

      expect(count).toBe(2);

      const updated1 = await leaderboardRepo.getUserRank('user_snap_1', 'guild_snap');
      expect(updated1?.serverRank).toBe(2);
      expect(updated1?.globalRank).toBe(12);

      const inserted2 = await leaderboardRepo.getUserRank('user_snap_2', 'guild_snap');
      expect(inserted2?.serverRank).toBe(1);
      expect(inserted2?.globalRank).toBe(5);

      // Server paginated leaderboard
      const serverLb = await leaderboardRepo.getServerLeaderboard('guild_snap', {
        limit: 10,
        offset: 0,
      });
      expect(serverLb.total).toBe(2);
      expect(serverLb.items[0]?.userId).toBe('user_snap_2'); // serverRank 1
      expect(serverLb.items[1]?.userId).toBe('user_snap_1'); // serverRank 2
    });
  });

  describe('ItemRepository', () => {
    it('creates, queries, and seeds default shop catalog', async () => {
      const seeded = await itemRepo.seedDefaultCatalog();
      expect(seeded).toBe(4);

      // Re-seeding should not insert duplicates
      const reseeded = await itemRepo.seedDefaultCatalog();
      expect(reseeded).toBe(0);

      const items = await itemRepo.findAll();
      expect(items.length).toBe(4);

      const candy = await itemRepo.findByCode('candy_minor');
      expect(candy).not.toBeNull();
      expect(candy?.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(candy?.name).toBe('Minor Energy Candy');
      expect(candy?.price).toBe(100);
      expect(await itemRepo.findById(candy!.id)).toMatchObject({ code: 'candy_minor' });

      const categories = new ItemCategoryRepository(db.client);
      const consumable = await categories.findByCode('consumable');
      expect(consumable?.name).toBe('Consumables');
      expect(candy?.categoryId).toBe(consumable?.id);
      expect((await categories.findAll()).map((category) => category.code)).toEqual([
        'consumable',
        'cosmetic',
      ]);

      const purchasable = await itemRepo.findPurchasable();
      expect(purchasable.length).toBe(4);
    });

    // Postgres ids are uuids; only SQLite seeds ever used the code as the ID.
    it.skipIf(db.dialect === 'postgres')(
      'fills codes on items an older SQLite seed stored with the code as ID',
      async () => {
        await itemRepo.create({
          id: 'candy_minor',
          name: 'Renamed Candy',
          description: 'Owner edit',
          price: 5,
          categoryId: 'consumable',
        });
        await inventoryRepo.addItem('legacy_user', 'candy_minor', 2);

        expect(await itemRepo.seedDefaultCatalog()).toBe(3);
        expect(await itemRepo.seedDefaultCatalog()).toBe(0);

        const candy = await itemRepo.findByCode('candy_minor');
        const consumable = await new ItemCategoryRepository(db.client).findByCode('consumable');
        expect(candy).toMatchObject({
          id: 'candy_minor',
          name: 'Renamed Candy',
          price: 5,
          categoryId: consumable?.id,
        });
        expect(await inventoryRepo.getItemQuantity('legacy_user', candy!.id)).toBe(2);
        expect((await itemRepo.findAll()).length).toBe(4);
      },
    );

    it('keeps owner edits to seeded items', async () => {
      await itemRepo.seedDefaultCatalog();
      const potion = await itemRepo.findByCode('stamina_potion');
      await itemRepo.update(potion!.id, { price: 999, isPurchasable: false });
      await itemRepo.seedDefaultCatalog();
      expect(await itemRepo.findByCode('stamina_potion')).toMatchObject({
        price: 999,
        isPurchasable: false,
      });
    });
  });

  describe('InventoryRepository', () => {
    it('adds, removes, and retrieves inventory bag slots atomically', async () => {
      await itemRepo.seedDefaultCatalog();
      const candyId = (await itemRepo.findByCode('candy_minor'))!.id;

      // Add 2 candies
      const slot = await inventoryRepo.addItem('inv_user_1', candyId, 2);
      expect(slot.quantity).toBe(2);

      // Add 1 more candy (updates quantity to 3)
      const updated = await inventoryRepo.addItem('inv_user_1', candyId, 1);
      expect(updated.quantity).toBe(3);

      // Check quantity
      const qty = await inventoryRepo.getItemQuantity('inv_user_1', candyId);
      expect(qty).toBe(3);

      // Retrieve inventory with joined item details
      const bag = await inventoryRepo.getUserInventoryWithItems('inv_user_1');
      expect(bag.length).toBe(1);
      expect(bag[0]?.inventory.quantity).toBe(3);
      expect(bag[0]?.item?.name).toBe('Minor Energy Candy');

      // Remove 1 candy
      const remaining = await inventoryRepo.removeItem('inv_user_1', candyId, 1);
      expect(remaining?.quantity).toBe(2);

      // Remove remaining 2 candies (deletes row)
      const emptied = await inventoryRepo.removeItem('inv_user_1', candyId, 2);
      expect(emptied).toBeNull();

      const finalQty = await inventoryRepo.getItemQuantity('inv_user_1', candyId);
      expect(finalQty).toBe(0);
    });
  });

  describe('PlayerEnergyRepository', () => {
    it('keeps the potion allowance spent after gameplay drains the restored energy', async () => {
      await playerEnergyRepo.create({
        userId: 'batch_then_play',
        currentEnergy: 0,
        lastResetDate: getResetDayKey(new Date(), DEFAULT_RESET_SCHEDULE),
      });
      await playerEnergyRepo.consumeEnergyPotion('batch_then_play', 100, 3, undefined, 2);
      expect(await playerEnergyRepo.consumeEnergy('batch_then_play', 75)).toMatchObject({
        success: true,
        currentEnergy: 25,
      });
      expect(
        await playerEnergyRepo.consumeEnergyPotion('batch_then_play', 100, 3, undefined, 2),
      ).toMatchObject({
        success: false,
        potsUsedToday: 2,
        energyRestored: 0,
        energy: { currentEnergy: 25 },
      });
      expect(await playerEnergyRepo.consumeEnergyPotion('batch_then_play', 50, 3)).toMatchObject({
        success: true,
        potsUsedToday: 3,
        energy: { currentEnergy: 75 },
      });
    });

    it('serializes competing batches against the remaining potion allowance', async () => {
      await playerEnergyRepo.getOrCreate('bulk_race');
      await playerEnergyRepo.update('bulk_race', { currentEnergy: 0 });
      const results = await Promise.all([
        playerEnergyRepo.consumeEnergyPotion('bulk_race', 100, 3, undefined, 2),
        playerEnergyRepo.consumeEnergyPotion('bulk_race', 100, 3, undefined, 2),
      ]);
      expect(results.filter((r) => r.success)).toHaveLength(1);
      expect((await playerEnergyRepo.findById('bulk_race'))?.dailyEnergyPotsUsed).toBe(2);
      await playerEnergyRepo.update('bulk_race', {
        lastResetDate: '2000-01-01',
        dailyEnergyPotsUsed: 3,
        currentEnergy: 0,
      });
      expect(
        await playerEnergyRepo.consumeEnergyPotion('bulk_race', 150, 3, undefined, 3),
      ).toMatchObject({ success: true, potsUsedToday: 3, energyRestored: 100 });
    });

    it.each([0, -1, 1.5, NaN, Infinity])(
      'rejects invalid batch quantity %s before updating energy',
      async (quantity) => {
        await expect(
          playerEnergyRepo.consumeEnergyPotion('invalid_batch', 50, 3, undefined, quantity),
        ).rejects.toThrow('Potion quantity');
        expect(await playerEnergyRepo.findById('invalid_batch')).toBeNull();
      },
    );

    it('tracks stamina consumption and enforces anti-abuse ceiling', async () => {
      const initial = await playerEnergyRepo.getOrCreate('energy_tester');
      expect(initial.currentEnergy).toBe(100);
      expect(initial.dailyEnergyPotsUsed).toBe(0);

      // Set energy to 20
      await playerEnergyRepo.update('energy_tester', { currentEnergy: 20 });

      // Pot 1: +50 -> 70 energy, potsUsed = 1
      const pot1 = await playerEnergyRepo.consumeEnergyPotion('energy_tester', 50, 3);
      expect(pot1.success).toBe(true);
      expect(pot1.energy.currentEnergy).toBe(70);
      expect(pot1.potsUsedToday).toBe(1);

      // Pot 2: +50 -> 100 energy (capped at 100), potsUsed = 2
      const pot2 = await playerEnergyRepo.consumeEnergyPotion('energy_tester', 50, 3);
      expect(pot2.success).toBe(true);
      expect(pot2.energy.currentEnergy).toBe(100);
      expect(pot2.potsUsedToday).toBe(2);

      // Pot 3: potsUsed = 3
      const pot3 = await playerEnergyRepo.consumeEnergyPotion('energy_tester', 50, 3);
      expect(pot3.success).toBe(true);
      expect(pot3.potsUsedToday).toBe(3);

      // Pot 4: fails due to ceiling (max 3/day)
      const pot4 = await playerEnergyRepo.consumeEnergyPotion('energy_tester', 50, 3);
      expect(pot4.success).toBe(false);
      expect(pot4.reason).toContain('Daily stamina potion ceiling reached');
      expect(pot4.potsUsedToday).toBe(3);

      // Simulate next day rollover: lastResetDate in the past
      await playerEnergyRepo.update('energy_tester', {
        lastResetDate: '2020-01-01',
        currentEnergy: 30,
      });

      // Next day pot -> succeeds and resets potsUsedToday to 1
      const potNextDay = await playerEnergyRepo.consumeEnergyPotion('energy_tester', 50, 3);
      expect(potNextDay.success).toBe(true);
      expect(potNextDay.potsUsedToday).toBe(1);
      expect(potNextDay.energy.currentEnergy).toBe(80);
    });
  });
});
