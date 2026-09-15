import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  EconomyRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { DailyService } from './daily.service.js';

describe('DailyService', () => {
  let client: SqliteDatabaseClient;
  let repo: EconomyRepository;
  let dailyService: DailyService;

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
    dailyService = new DailyService({
      repository: repo,
      baseReward: 250,
      streakBonusPercent: 0.05,
      maxStreakBonusPercent: 1.5,
      cooldownWindowMs: 24 * 3600 * 1000,
      graceWindowMs: 12 * 3600 * 1000,
    });
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Multiplier and Reward Calculations', () => {
    it('calculates 1.0x multiplier and base 250 credits for Day 1', () => {
      expect(dailyService.calculateMultiplier(1)).toBe(1.0);
      expect(dailyService.calculateReward(1)).toBe(250);
    });

    it('calculates +5% per day for Day 2 to Day 30', () => {
      expect(dailyService.calculateMultiplier(2)).toBe(1.05);
      expect(dailyService.calculateReward(2)).toBe(263);

      expect(dailyService.calculateMultiplier(3)).toBe(1.1);
      expect(dailyService.calculateReward(3)).toBe(275);

      expect(dailyService.calculateMultiplier(11)).toBe(1.5);
      expect(dailyService.calculateReward(11)).toBe(375);
    });

    it('caps streak bonus at +150% (2.50x multiplier, 625 credits) for 30+ days', () => {
      expect(dailyService.calculateMultiplier(31)).toBe(2.5);
      expect(dailyService.calculateReward(31)).toBe(625);

      expect(dailyService.calculateMultiplier(50)).toBe(2.5);
      expect(dailyService.calculateReward(50)).toBe(625);
    });
  });

  describe('getStatus', () => {
    it('returns canClaim=true for a brand new account', async () => {
      const status = await dailyService.getStatus('user_new');

      expect(status.canClaim).toBe(true);
      expect(status.isFrozen).toBe(false);
      expect(status.currentStreak).toBe(0);
      expect(status.nextStreak).toBe(1);
      expect(status.multiplier).toBe(1.0);
      expect(status.rewardCredits).toBe(250);
      expect(status.lastDailyAt).toBeNull();
      expect(status.timeUntilNextClaimMs).toBe(0);
    });

    it('returns canClaim=false when on cooldown (<24 hours)', async () => {
      const now = Date.now();
      const twelveHoursAgo = new Date(now - 12 * 3600 * 1000);

      await repo.getOrCreateAccount('user_cooldown');
      await repo.updateAccount('user_cooldown', {
        dailyStreak: 3,
        lastDailyAt: twelveHoursAgo,
      });

      const status = await dailyService.getStatus('user_cooldown', now);

      expect(status.canClaim).toBe(false);
      expect(status.currentStreak).toBe(3);
      expect(status.nextStreak).toBe(4);
      expect(status.timeUntilNextClaimMs).toBeGreaterThan(0);
      expect(status.timeUntilNextClaimMs).toBeLessThanOrEqual(12 * 3600 * 1000);
    });

    it('returns canClaim=true during grace period (24h to 36h) with incremented streak', async () => {
      const now = Date.now();
      const twentySixHoursAgo = new Date(now - 26 * 3600 * 1000);

      await repo.getOrCreateAccount('user_grace');
      await repo.updateAccount('user_grace', {
        dailyStreak: 5,
        lastDailyAt: twentySixHoursAgo,
      });

      const status = await dailyService.getStatus('user_grace', now);

      expect(status.canClaim).toBe(true);
      expect(status.currentStreak).toBe(5);
      expect(status.nextStreak).toBe(6);
      expect(status.multiplier).toBe(1.25);
      expect(status.rewardCredits).toBe(313);
      expect(status.timeUntilNextClaimMs).toBe(0);
      expect(status.timeUntilResetMs).toBeGreaterThan(0);
    });

    it('returns canClaim=true but streak resets to 1 after grace period expires (>36h)', async () => {
      const now = Date.now();
      const fortyHoursAgo = new Date(now - 40 * 3600 * 1000);

      await repo.getOrCreateAccount('user_expired');
      await repo.updateAccount('user_expired', {
        dailyStreak: 10,
        lastDailyAt: fortyHoursAgo,
      });

      const status = await dailyService.getStatus('user_expired', now);

      expect(status.canClaim).toBe(true);
      expect(status.currentStreak).toBe(10);
      expect(status.nextStreak).toBe(1);
      expect(status.multiplier).toBe(1.0);
      expect(status.rewardCredits).toBe(250);
      expect(status.timeUntilResetMs).toBe(0);
    });

    it('returns canClaim=false if the account is frozen', async () => {
      await repo.getOrCreateAccount('user_frozen');
      await repo.freezeAccount('user_frozen', true);

      const status = await dailyService.getStatus('user_frozen');

      expect(status.canClaim).toBe(false);
      expect(status.isFrozen).toBe(true);
    });
  });

  describe('claimDaily', () => {
    it('successfully claims Day 1 reward, credits wallet, and creates ledger entry', async () => {
      const now = Date.now();
      const result = await dailyService.claimDaily('user_1', 'guild_1', now);

      expect(result.success).toBe(true);
      expect(result.creditsAwarded).toBe(250);
      expect(result.streak).toBe(1);
      expect(result.multiplier).toBe(1.0);
      expect(result.wasReset).toBe(false);
      expect(result.walletBalance).toBe(250);
      expect(result.transactionId).toBeDefined();

      const account = await repo.getAccount('user_1');
      expect(account?.dailyStreak).toBe(1);
      expect(account?.lastDailyAt).toEqual(new Date(now));

      const balance = await repo.findById('user_1');
      expect(balance?.walletBalance).toBe(250);
    });

    it('rejects claim if attempted within cooldown window (<24 hours)', async () => {
      const startTime = Date.now();
      await dailyService.claimDaily('user_cooldown_test', 'guild_1', startTime);

      // Attempt claim 2 hours later
      const attemptTime = startTime + 2 * 3600 * 1000;
      const result = await dailyService.claimDaily('user_cooldown_test', 'guild_1', attemptTime);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Daily reward is on cooldown');
      expect(result.creditsAwarded).toBe(0);
      expect(result.streak).toBe(1);

      // Balance remains 250
      const balance = await repo.findById('user_cooldown_test');
      expect(balance?.walletBalance).toBe(250);
    });

    it('advances streak and applies compound multiplier during grace window (25h later)', async () => {
      const day1Time = Date.now();
      await dailyService.claimDaily('user_streak_test', 'guild_1', day1Time);

      // Claim 25 hours later (valid streak progression window)
      const day2Time = day1Time + 25 * 3600 * 1000;
      const result = await dailyService.claimDaily('user_streak_test', 'guild_1', day2Time);

      expect(result.success).toBe(true);
      expect(result.streak).toBe(2);
      expect(result.multiplier).toBe(1.05);
      expect(result.creditsAwarded).toBe(263);
      expect(result.wasReset).toBe(false);
      expect(result.walletBalance).toBe(250 + 263);

      const account = await repo.getAccount('user_streak_test');
      expect(account?.dailyStreak).toBe(2);
    });

    it('resets streak to 1 if claimed after grace period expires (>36 hours)', async () => {
      const day1Time = Date.now();
      await dailyService.claimDaily('user_reset_test', 'guild_1', day1Time);

      // Advance artificially to Day 5 by modifying account streak
      await repo.updateAccount('user_reset_test', {
        dailyStreak: 5,
        lastDailyAt: new Date(day1Time),
      });

      // Claim 40 hours after day1Time (>36h grace window)
      const expiredTime = day1Time + 40 * 3600 * 1000;
      const result = await dailyService.claimDaily('user_reset_test', 'guild_1', expiredTime);

      expect(result.success).toBe(true);
      expect(result.streak).toBe(1);
      expect(result.multiplier).toBe(1.0);
      expect(result.creditsAwarded).toBe(250);
      expect(result.wasReset).toBe(true);

      const account = await repo.getAccount('user_reset_test');
      expect(account?.dailyStreak).toBe(1);
    });

    it('blocks claim if the user account is frozen', async () => {
      await repo.freezeAccount('user_frozen_test', true);

      const result = await dailyService.claimDaily('user_frozen_test');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('ACCOUNT_FROZEN');
      expect(result.creditsAwarded).toBe(0);

      const balance = await repo.findById('user_frozen_test');
      expect(balance).toBeNull();
    });
  });
});
