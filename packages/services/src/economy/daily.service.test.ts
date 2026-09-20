import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDatabaseClient,
  EconomyRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { DEFAULT_RESET_SCHEDULE } from '@ririko/core';
import { DailyService } from './daily.service.js';

/**
 * Reset days run 00:00-23:59 GMT+8, which is 16:00 UTC on the previous date through
 * 15:59 UTC. `resetDay(n)` returns midday inside reset day n so every fixture sits well
 * clear of a boundary, and `+ 1` between two of them means exactly one reset apart.
 */
const RESET_DAY_ZERO_UTC = Date.parse('2026-09-20T16:00:00.000Z');
const MS_PER_DAY = 86_400_000;
const resetDay = (dayOffset: number, hoursIntoDay = 12): number =>
  RESET_DAY_ZERO_UTC + dayOffset * MS_PER_DAY + hoursIntoDay * 3_600_000;

describe('DailyService', () => {
  let client: SqliteDatabaseClient;
  let repo: EconomyRepository;
  let dailyService: DailyService;

  const buildService = (streakForgiveness = 3): DailyService =>
    new DailyService({
      repository: repo,
      baseReward: 250,
      streakBonusPercent: 0.05,
      maxStreakBonusPercent: 1.5,
      resetSchedule: DEFAULT_RESET_SCHEDULE,
      streakForgiveness,
    });

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
    dailyService = buildService();
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
      expect(dailyService.calculateMultiplier(6)).toBe(1.25);
      expect(dailyService.calculateReward(2)).toBe(263);
    });

    it('caps streak bonus at +150% (2.50x multiplier, 625 credits) for 30+ days', () => {
      expect(dailyService.calculateMultiplier(31)).toBe(2.5);
      expect(dailyService.calculateMultiplier(100)).toBe(2.5);
      expect(dailyService.calculateReward(31)).toBe(625);
    });
  });

  describe('getStatus', () => {
    it('returns canClaim=true for a brand new account', async () => {
      const status = await dailyService.getStatus('user_new', resetDay(0));

      expect(status.canClaim).toBe(true);
      expect(status.isFrozen).toBe(false);
      expect(status.currentStreak).toBe(0);
      expect(status.nextStreak).toBe(1);
      expect(status.multiplier).toBe(1.0);
      expect(status.rewardCredits).toBe(250);
      expect(status.lastDailyAt).toBeNull();
      expect(status.timeUntilNextClaimMs).toBe(0);
      expect(status.missedDays).toBe(0);
    });

    it('returns canClaim=false once claimed within the same reset day', async () => {
      await repo.getOrCreateAccount('user_claimed');
      await repo.updateAccount('user_claimed', {
        dailyStreak: 3,
        lastDailyAt: new Date(resetDay(0, 1)),
      });

      const status = await dailyService.getStatus('user_claimed', resetDay(0, 20));

      expect(status.canClaim).toBe(false);
      expect(status.currentStreak).toBe(3);
      expect(status.nextStreak).toBe(4);
      expect(status.missedDays).toBe(0);
      expect(status.timeUntilNextClaimMs).toBeGreaterThan(0);
      expect(status.timeUntilNextClaimMs).toBe(status.timeUntilResetMs);
    });

    it('returns canClaim=true on the next reset day with an incremented streak', async () => {
      await repo.getOrCreateAccount('user_next_day');
      await repo.updateAccount('user_next_day', {
        dailyStreak: 5,
        lastDailyAt: new Date(resetDay(0)),
      });

      const status = await dailyService.getStatus('user_next_day', resetDay(1));

      expect(status.canClaim).toBe(true);
      expect(status.currentStreak).toBe(5);
      expect(status.nextStreak).toBe(6);
      expect(status.multiplier).toBe(1.25);
      expect(status.rewardCredits).toBe(313);
      expect(status.missedDays).toBe(0);
      expect(status.forgivenessRemaining).toBe(3);
      expect(status.timeUntilNextClaimMs).toBe(0);
    });

    it('reports missed days and shrinking forgiveness while the streak survives', async () => {
      await repo.getOrCreateAccount('user_missed');
      await repo.updateAccount('user_missed', {
        dailyStreak: 15,
        lastDailyAt: new Date(resetDay(0)),
      });

      // Two whole reset days skipped (days 1 and 2); claiming on day 3.
      const status = await dailyService.getStatus('user_missed', resetDay(3));

      expect(status.canClaim).toBe(true);
      expect(status.currentStreak).toBe(15);
      expect(status.nextStreak).toBe(16);
      expect(status.missedDays).toBe(2);
      expect(status.forgivenessRemaining).toBe(1);
    });

    it('reports a streak already lost to inactivity as zero', async () => {
      await repo.getOrCreateAccount('user_lost');
      await repo.updateAccount('user_lost', {
        dailyStreak: 10,
        lastDailyAt: new Date(resetDay(0)),
      });

      // Three whole reset days skipped reaches the forgiveness threshold.
      const status = await dailyService.getStatus('user_lost', resetDay(4));

      expect(status.canClaim).toBe(true);
      expect(status.currentStreak).toBe(0);
      expect(status.nextStreak).toBe(1);
      expect(status.missedDays).toBe(3);
      expect(status.forgivenessRemaining).toBe(0);
      expect(status.rewardCredits).toBe(250);
    });

    it('returns canClaim=false if the account is frozen', async () => {
      await repo.getOrCreateAccount('user_frozen');
      await repo.freezeAccount('user_frozen', true);

      const status = await dailyService.getStatus('user_frozen', resetDay(0));

      expect(status.canClaim).toBe(false);
      expect(status.isFrozen).toBe(true);
    });
  });

  describe('claimDaily', () => {
    it('successfully claims Day 1 reward, credits wallet, and creates ledger entry', async () => {
      const now = resetDay(0);
      const result = await dailyService.claimDaily('user_1', 'guild_1', now);

      expect(result.success).toBe(true);
      expect(result.creditsAwarded).toBe(250);
      expect(result.streak).toBe(1);
      expect(result.multiplier).toBe(1.0);
      expect(result.wasReset).toBe(false);
      expect(result.missedDays).toBe(0);
      expect(result.walletBalance).toBe(250);
      expect(result.transactionId).toBeDefined();

      const account = await repo.getAccount('user_1');
      expect(account?.dailyStreak).toBe(1);
      expect(account?.lastDailyAt).toEqual(new Date(now));

      const balance = await repo.findById('user_1');
      expect(balance?.walletBalance).toBe(250);
    });

    it('rejects a second claim inside the same reset day', async () => {
      await dailyService.claimDaily('user_same_day', 'guild_1', resetDay(0, 1));

      // 20 hours later is still the same GMT+8 calendar day.
      const result = await dailyService.claimDaily('user_same_day', 'guild_1', resetDay(0, 20));

      expect(result.success).toBe(false);
      expect(result.reason).toContain('already claimed today');
      expect(result.creditsAwarded).toBe(0);
      expect(result.streak).toBe(1);

      const balance = await repo.findById('user_same_day');
      expect(balance?.walletBalance).toBe(250);
    });

    it('allows a claim just past the boundary even if only minutes have elapsed', async () => {
      // 15:59 UTC and 16:01 UTC are minutes apart but fall in different GMT+8 days.
      const lateInDay = RESET_DAY_ZERO_UTC - 60_000;
      const justAfterBoundary = RESET_DAY_ZERO_UTC + 60_000;

      await dailyService.claimDaily('user_boundary', 'guild_1', lateInDay);
      const result = await dailyService.claimDaily('user_boundary', 'guild_1', justAfterBoundary);

      expect(result.success).toBe(true);
      expect(result.streak).toBe(2);
      expect(result.missedDays).toBe(0);
    });

    it('advances the streak on consecutive reset days', async () => {
      await dailyService.claimDaily('user_streak', 'guild_1', resetDay(0));
      const result = await dailyService.claimDaily('user_streak', 'guild_1', resetDay(1));

      expect(result.success).toBe(true);
      expect(result.streak).toBe(2);
      expect(result.multiplier).toBe(1.05);
      expect(result.creditsAwarded).toBe(263);
      expect(result.wasReset).toBe(false);
      expect(result.walletBalance).toBe(250 + 263);

      const account = await repo.getAccount('user_streak');
      expect(account?.dailyStreak).toBe(2);
    });

    it('skips missed days rather than counting them: 15 + 2 missed resumes at 16', async () => {
      await repo.getOrCreateAccount('user_resume');
      await repo.updateAccount('user_resume', {
        dailyStreak: 15,
        lastDailyAt: new Date(resetDay(0)),
      });

      // Days 1 and 2 missed; claim lands on day 3.
      const result = await dailyService.claimDaily('user_resume', 'guild_1', resetDay(3));

      expect(result.success).toBe(true);
      expect(result.streak).toBe(16);
      expect(result.missedDays).toBe(2);
      expect(result.wasReset).toBe(false);

      const account = await repo.getAccount('user_resume');
      expect(account?.dailyStreak).toBe(16);
    });

    it('survives a single missed day', async () => {
      await repo.getOrCreateAccount('user_one_miss');
      await repo.updateAccount('user_one_miss', {
        dailyStreak: 7,
        lastDailyAt: new Date(resetDay(0)),
      });

      const result = await dailyService.claimDaily('user_one_miss', 'guild_1', resetDay(2));

      expect(result.success).toBe(true);
      expect(result.streak).toBe(8);
      expect(result.missedDays).toBe(1);
      expect(result.wasReset).toBe(false);
    });

    it('wipes the streak once missed days reach the forgiveness threshold', async () => {
      await repo.getOrCreateAccount('user_wiped');
      await repo.updateAccount('user_wiped', {
        dailyStreak: 20,
        lastDailyAt: new Date(resetDay(0)),
      });

      // Days 1, 2 and 3 missed: three consecutive misses ends the run.
      const result = await dailyService.claimDaily('user_wiped', 'guild_1', resetDay(4));

      expect(result.success).toBe(true);
      expect(result.streak).toBe(1);
      expect(result.multiplier).toBe(1.0);
      expect(result.creditsAwarded).toBe(250);
      expect(result.missedDays).toBe(3);
      expect(result.wasReset).toBe(true);

      const account = await repo.getAccount('user_wiped');
      expect(account?.dailyStreak).toBe(1);
    });

    it('clears accumulated misses on every successful claim', async () => {
      await repo.getOrCreateAccount('user_cleared');
      await repo.updateAccount('user_cleared', {
        dailyStreak: 5,
        lastDailyAt: new Date(resetDay(0)),
      });

      // Miss two days, claim on day 3 — streak survives at 6.
      const first = await dailyService.claimDaily('user_cleared', 'guild_1', resetDay(3));
      expect(first.streak).toBe(6);
      expect(first.missedDays).toBe(2);

      // Miss two more days. Because the claim reset the counter, this is 2 again, not 4.
      const second = await dailyService.claimDaily('user_cleared', 'guild_1', resetDay(6));
      expect(second.success).toBe(true);
      expect(second.streak).toBe(7);
      expect(second.missedDays).toBe(2);
      expect(second.wasReset).toBe(false);
    });

    it('wipes on any missed day when forgiveness is disabled', async () => {
      const strictService = buildService(0);

      await repo.getOrCreateAccount('user_strict');
      await repo.updateAccount('user_strict', {
        dailyStreak: 9,
        lastDailyAt: new Date(resetDay(0)),
      });

      const result = await strictService.claimDaily('user_strict', 'guild_1', resetDay(2));

      expect(result.success).toBe(true);
      expect(result.streak).toBe(1);
      expect(result.missedDays).toBe(1);
      expect(result.wasReset).toBe(true);
    });

    it('still advances on consecutive days when forgiveness is disabled', async () => {
      const strictService = buildService(0);

      await strictService.claimDaily('user_strict_ok', 'guild_1', resetDay(0));
      const result = await strictService.claimDaily('user_strict_ok', 'guild_1', resetDay(1));

      expect(result.streak).toBe(2);
      expect(result.wasReset).toBe(false);
    });

    it('blocks claim if the user account is frozen', async () => {
      await repo.freezeAccount('user_frozen_test', true);

      const result = await dailyService.claimDaily('user_frozen_test', undefined, resetDay(0));

      expect(result.success).toBe(false);
      expect(result.reason).toBe('ACCOUNT_FROZEN');
      expect(result.creditsAwarded).toBe(0);

      const balance = await repo.findById('user_frozen_test');
      expect(balance).toBeNull();
    });
  });
});
