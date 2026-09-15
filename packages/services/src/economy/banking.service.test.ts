import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  EconomyRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { BankingService } from './banking.service.js';

describe('BankingService', () => {
  let client: SqliteDatabaseClient;
  let repo: EconomyRepository;
  let bankingService: BankingService;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    // Create required SQLite schema
    client.raw.exec(`
      CREATE TABLE IF NOT EXISTS economy_balances (
        user_id TEXT PRIMARY KEY,
        wallet_balance INTEGER NOT NULL DEFAULT 0,
        bank_balance INTEGER NOT NULL DEFAULT 0,
        bank_capacity INTEGER NOT NULL DEFAULT 10000,
        net_worth INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS economy_transactions (
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
      CREATE TABLE IF NOT EXISTS economy_accounts (
        user_id TEXT PRIMARY KEY,
        is_frozen INTEGER NOT NULL DEFAULT 0,
        daily_streak INTEGER NOT NULL DEFAULT 0,
        last_daily_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    repo = new EconomyRepository(client);
    bankingService = new BankingService({
      repository: repo,
      baseCapacity: 10000,
      capacityPerLevel: 2500,
      defaultInterestRatePercent: 0.5,
      maxDailyInterestCap: 5000,
    });
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Capacity Scaling', () => {
    it('calculates bank capacity scaling accurately with levels and expansions', () => {
      // Level 0: 10,000 base
      expect(bankingService.calculateBankCapacity(0)).toBe(10000);
      // Level 1: 10,000 + 2,500 = 12,500
      expect(bankingService.calculateBankCapacity(1)).toBe(12500);
      // Level 10: 10,000 + 25,000 = 35,000
      expect(bankingService.calculateBankCapacity(10)).toBe(35000);
      // Level 10 with 5,000 expansion: 40,000
      expect(bankingService.calculateBankCapacity(10, 5000)).toBe(40000);
      // Negative level clamps to 0
      expect(bankingService.calculateBankCapacity(-2)).toBe(10000);
    });

    it('syncBankCapacity persists updated capacity to database balance', async () => {
      await repo.getOrCreateBalance('user_cap');
      const newCap = await bankingService.syncBankCapacity('user_cap', 4, 1000);
      expect(newCap).toBe(10000 + 4 * 2500 + 1000); // 21,000

      const balance = await repo.findById('user_cap');
      expect(balance?.bankCapacity).toBe(21000);
    });
  });

  describe('Deposit (/deposit)', () => {
    beforeEach(async () => {
      // Seed initial wallet balance of 5,000
      await repo.modifyBalance({
        userId: 'user_deposit',
        walletDelta: 5000,
        type: 'ADMIN',
        source: 'TEST_SEED',
      });
    });

    it('successfully deposits a specific amount into bank', async () => {
      const result = await bankingService.deposit('user_deposit', 2000, 'guild_1');

      expect(result.success).toBe(true);
      expect(result.amount).toBe(2000);
      expect(result.walletBalance).toBe(3000);
      expect(result.bankBalance).toBe(2000);
      expect(result.netWorth).toBe(5000);
      expect(result.transactionId).toBeDefined();

      const balance = await repo.findById('user_deposit');
      expect(balance?.walletBalance).toBe(3000);
      expect(balance?.bankBalance).toBe(2000);
    });

    it('successfully deposits "all" up to bank capacity', async () => {
      const result = await bankingService.deposit('user_deposit', 'all', 'guild_1');

      expect(result.success).toBe(true);
      expect(result.amount).toBe(5000);
      expect(result.walletBalance).toBe(0);
      expect(result.bankBalance).toBe(5000);
    });

    it('caps deposit "all" when wallet exceeds available bank capacity', async () => {
      // Give user 15,000 in wallet (capacity is 10,000)
      await repo.modifyBalance({
        userId: 'user_rich',
        walletDelta: 15000,
        type: 'ADMIN',
        source: 'TEST_SEED',
      });

      const result = await bankingService.deposit('user_rich', 'all');

      expect(result.success).toBe(true);
      expect(result.amount).toBe(10000); // Only 10,000 fits in bank
      expect(result.walletBalance).toBe(5000);
      expect(result.bankBalance).toBe(10000);
    });

    it('rejects deposit if amount is invalid or zero', async () => {
      const res1 = await bankingService.deposit('user_deposit', 0);
      expect(res1.success).toBe(false);
      expect(res1.reason).toBe('INVALID_AMOUNT');

      const res2 = await bankingService.deposit('user_deposit', -500);
      expect(res2.success).toBe(false);
      expect(res2.reason).toBe('INVALID_AMOUNT');
    });

    it('rejects deposit if user has insufficient wallet funds', async () => {
      const result = await bankingService.deposit('user_deposit', 10000);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('INSUFFICIENT_WALLET_FUNDS');
      expect(result.amount).toBe(10000);
    });

    it('rejects deposit if it would exceed bank capacity', async () => {
      // Give user 12,000 in wallet
      await repo.modifyBalance({
        userId: 'user_deposit',
        walletDelta: 7000,
        type: 'ADMIN',
        source: 'TEST_SEED',
      });

      const result = await bankingService.deposit('user_deposit', 11000);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('EXCEEDS_BANK_CAPACITY');
    });

    it('rejects deposit if account is frozen', async () => {
      await repo.freezeAccount('user_deposit', true);

      const result = await bankingService.deposit('user_deposit', 1000);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('ACCOUNT_FROZEN');
    });
  });

  describe('Withdraw (/withdraw)', () => {
    beforeEach(async () => {
      // Seed bank balance of 4,000
      await repo.modifyBalance({
        userId: 'user_withdraw',
        bankDelta: 4000,
        type: 'ADMIN',
        source: 'TEST_SEED',
      });
    });

    it('successfully withdraws a specific amount from bank', async () => {
      const result = await bankingService.withdraw('user_withdraw', 1500, 'guild_1');

      expect(result.success).toBe(true);
      expect(result.amount).toBe(1500);
      expect(result.walletBalance).toBe(1500);
      expect(result.bankBalance).toBe(2500);
      expect(result.netWorth).toBe(4000);
    });

    it('successfully withdraws "all" from bank', async () => {
      const result = await bankingService.withdraw('user_withdraw', 'all');

      expect(result.success).toBe(true);
      expect(result.amount).toBe(4000);
      expect(result.walletBalance).toBe(4000);
      expect(result.bankBalance).toBe(0);
    });

    it('rejects withdraw if amount is invalid or zero', async () => {
      const result = await bankingService.withdraw('user_withdraw', 0);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('INVALID_AMOUNT');
    });

    it('rejects withdraw if insufficient bank balance', async () => {
      const result = await bankingService.withdraw('user_withdraw', 5000);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('INSUFFICIENT_BANK_FUNDS');
    });

    it('rejects withdraw "all" if bank is empty', async () => {
      await repo.getOrCreateBalance('user_empty');
      const result = await bankingService.withdraw('user_empty', 'all');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('NO_BANK_FUNDS');
    });

    it('rejects withdraw if account is frozen', async () => {
      await repo.freezeAccount('user_withdraw', true);

      const result = await bankingService.withdraw('user_withdraw', 1000);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('ACCOUNT_FROZEN');
    });
  });

  describe('Deadlock-Free P2P Transfers (/pay)', () => {
    beforeEach(async () => {
      // Seed sender with 3,000 wallet credits
      await repo.modifyBalance({
        userId: 'sender_1',
        walletDelta: 3000,
        type: 'ADMIN',
        source: 'TEST_SEED',
      });
      // Seed recipient with 500 wallet credits
      await repo.modifyBalance({
        userId: 'recipient_1',
        walletDelta: 500,
        type: 'ADMIN',
        source: 'TEST_SEED',
      });
    });

    it('successfully executes atomic transfer between two users', async () => {
      const result = await bankingService.transfer({
        fromUserId: 'sender_1',
        toUserId: 'recipient_1',
        amount: 1000,
        guildId: 'guild_1',
        reason: 'Lunch payment',
      });

      expect(result.success).toBe(true);
      expect(result.amount).toBe(1000);
      expect(result.fromWalletBalance).toBe(2000);
      expect(result.toWalletBalance).toBe(1500);
      expect(result.debitTransactionId).toBeDefined();
      expect(result.creditTransactionId).toBeDefined();

      const senderBal = await repo.findById('sender_1');
      const recipientBal = await repo.findById('recipient_1');
      expect(senderBal?.walletBalance).toBe(2000);
      expect(recipientBal?.walletBalance).toBe(1500);
    });

    it('rejects transfer to oneself', async () => {
      const result = await bankingService.transfer({
        fromUserId: 'sender_1',
        toUserId: 'sender_1',
        amount: 500,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('CANNOT_TRANSFER_TO_SELF');
    });

    it('rejects transfer with non-positive or non-integer amount', async () => {
      const result = await bankingService.transfer({
        fromUserId: 'sender_1',
        toUserId: 'recipient_1',
        amount: -100,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('INVALID_AMOUNT');
    });

    it('rejects transfer if sender has insufficient funds', async () => {
      const result = await bankingService.transfer({
        fromUserId: 'sender_1',
        toUserId: 'recipient_1',
        amount: 5000,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('INSUFFICIENT_FUNDS');
      expect(result.fromWalletBalance).toBe(3000);
    });

    it('rejects transfer if sender account is frozen', async () => {
      await repo.freezeAccount('sender_1', true);

      const result = await bankingService.transfer({
        fromUserId: 'sender_1',
        toUserId: 'recipient_1',
        amount: 500,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('SENDER_ACCOUNT_FROZEN');
    });

    it('rejects transfer if recipient account is frozen', async () => {
      await repo.freezeAccount('recipient_1', true);

      const result = await bankingService.transfer({
        fromUserId: 'sender_1',
        toUserId: 'recipient_1',
        amount: 500,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('RECIPIENT_ACCOUNT_FROZEN');
    });
  });

  describe('Daily Bank Interest Yield', () => {
    it('calculates interest yield accurately based on rate and cap', () => {
      // 10,000 at 0.5% = 50
      expect(bankingService.calculateDailyInterest(10000, 0.5)).toBe(50);
      // 100,000 at 1.0% = 1,000
      expect(bankingService.calculateDailyInterest(100000, 1.0)).toBe(1000);
      // Capped at maxDailyInterestCap (default 5,000)
      expect(bankingService.calculateDailyInterest(2000000, 1.0, 5000)).toBe(5000);
      // 0 bank balance yields 0
      expect(bankingService.calculateDailyInterest(0, 1.0)).toBe(0);
    });

    it('applies daily interest to bank balance and generates ledger transaction', async () => {
      await repo.getOrCreateBalance('user_interest', 25000);
      await repo.setBankCapacity('user_interest', 25000);
      await repo.modifyBalance({
        userId: 'user_interest',
        bankDelta: 10000,
        type: 'ADMIN',
        source: 'TEST_SEED',
      });

      const result = await bankingService.applyDailyInterest('user_interest', {
        ratePercent: 1.0,
      });

      expect(result.success).toBe(true);
      expect(result.bankBalanceBefore).toBe(10000);
      expect(result.interestAwarded).toBe(100); // 1% of 10,000
      expect(result.bankBalanceAfter).toBe(10100);
      expect(result.transactionId).toBeDefined();

      const balance = await repo.findById('user_interest');
      expect(balance?.bankBalance).toBe(10100);
    });

    it('rejects interest when bank balance is zero', async () => {
      await repo.getOrCreateBalance('user_zero');

      const result = await bankingService.applyDailyInterest('user_zero');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('NO_BANK_FUNDS');
    });

    it('rejects interest when bank is already at capacity', async () => {
      await repo.modifyBalance({
        userId: 'user_full',
        bankDelta: 10000, // full capacity
        type: 'ADMIN',
        source: 'TEST_SEED',
      });

      const result = await bankingService.applyDailyInterest('user_full');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('BANK_FULL');
    });

    it('bounds interest to remaining bank capacity when near capacity', async () => {
      // 9,980 in bank (capacity 10,000). Remaining capacity = 20.
      await repo.modifyBalance({
        userId: 'user_near_full',
        bankDelta: 9980,
        type: 'ADMIN',
        source: 'TEST_SEED',
      });

      // 1% of 9,980 is 99, but only 20 fits!
      const result = await bankingService.applyDailyInterest('user_near_full', {
        ratePercent: 1.0,
      });

      expect(result.success).toBe(true);
      expect(result.interestAwarded).toBe(20);
      expect(result.bankBalanceAfter).toBe(10000);
    });

    it('rejects interest if account is frozen', async () => {
      await repo.modifyBalance({
        userId: 'user_frozen_interest',
        bankDelta: 5000,
        type: 'ADMIN',
        source: 'TEST_SEED',
      });
      await repo.freezeAccount('user_frozen_interest', true);

      const result = await bankingService.applyDailyInterest('user_frozen_interest');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('ACCOUNT_FROZEN');
    });
  });
});
