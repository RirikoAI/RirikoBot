import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GiveawayEngine } from '../engine.js';
import type { GiveawayRepository, Giveaway, GiveawayEntry, GiveawayWinner } from '@ririko/database';

describe('GiveawayEngine (TASK-0901)', () => {
  let mockRepo: Partial<GiveawayRepository>;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findById: vi.fn(),
      listExpiredPendingGiveaways: vi.fn(),
      getEntries: vi.fn(),
      getWinners: vi.fn(),
      endGiveaway: vi.fn(),
      recordWinners: vi.fn(),
    };
  });

  describe('Deterministic Winner Selection', () => {
    it('should return empty array if no eligible entries exist', () => {
      const engine = new GiveawayEngine(mockRepo as GiveawayRepository);
      const winners = engine.selectWinners([], 1);
      expect(winners).toEqual([]);
    });

    it('should return all entrants if eligible count <= winnerCount', () => {
      const engine = new GiveawayEngine(mockRepo as GiveawayRepository);
      const entries: GiveawayEntry[] = [
        { giveawayId: 'gw-1', userId: 'user-a', bonusMultiplier: 1, enteredAt: new Date() },
        { giveawayId: 'gw-1', userId: 'user-b', bonusMultiplier: 1, enteredAt: new Date() },
      ];

      const winners = engine.selectWinners(entries, 3);
      expect(winners).toEqual(['user-a', 'user-b']);
    });

    it('should exclude existing winners from selection', () => {
      const engine = new GiveawayEngine(mockRepo as GiveawayRepository);
      const entries: GiveawayEntry[] = [
        { giveawayId: 'gw-1', userId: 'user-a', bonusMultiplier: 1, enteredAt: new Date() },
        { giveawayId: 'gw-1', userId: 'user-b', bonusMultiplier: 1, enteredAt: new Date() },
      ];

      const winners = engine.selectWinners(entries, 1, ['user-a']);
      expect(winners).toEqual(['user-b']);
    });

    it('should deterministically select winner using fixed pseudo-RNG', () => {
      // Deterministic PRNG returning constant 0.1
      const deterministicRng = () => 0.1;
      const engine = new GiveawayEngine(mockRepo as GiveawayRepository, {
        rngFn: deterministicRng,
      });

      const entries: GiveawayEntry[] = [
        { giveawayId: 'gw-1', userId: 'user-first', bonusMultiplier: 1, enteredAt: new Date() },
        { giveawayId: 'gw-1', userId: 'user-second', bonusMultiplier: 1, enteredAt: new Date() },
        { giveawayId: 'gw-1', userId: 'user-third', bonusMultiplier: 1, enteredAt: new Date() },
      ];

      // totalWeight = 3, threshold = 0.1 * 3 = 0.3 <= 1 -> selects user-first
      const winners = engine.selectWinners(entries, 1, [], deterministicRng);
      expect(winners).toEqual(['user-first']);
    });

    it('should respect weighted bonus multipliers in selection', () => {
      // Sequence of rolls: first roll threshold picks weighted candidate
      let rollCount = 0;
      // First roll 0.8 -> 0.8 * 11 = 8.8 (falls in user-boosted: weight 10, total 11)
      const rngSequence = [0.8];
      const deterministicRng = () => rngSequence[rollCount++] ?? 0.5;

      const engine = new GiveawayEngine(mockRepo as GiveawayRepository, {
        rngFn: deterministicRng,
      });

      const entries: GiveawayEntry[] = [
        { giveawayId: 'gw-1', userId: 'user-regular', bonusMultiplier: 1, enteredAt: new Date() },
        { giveawayId: 'gw-1', userId: 'user-boosted', bonusMultiplier: 10, enteredAt: new Date() },
      ];

      const winners = engine.selectWinners(entries, 1, [], deterministicRng);
      expect(winners).toEqual(['user-boosted']);
    });
  });

  describe('Entry Requirements Validation', () => {
    const engine = new GiveawayEngine({} as GiveawayRepository);
    const now = Date.now();

    it('should allow entry when no requirements specified', () => {
      const res = engine.validateEntry({
        createdTimestamp: now - 1000,
        roleIds: [],
        isBooster: false,
      });

      expect(res.allowed).toBe(true);
      expect(res.bonusMultiplier).toBe(1);
    });

    it('should award 2x multiplier to server boosters', () => {
      const res = engine.validateEntry({
        createdTimestamp: now - 1000,
        roleIds: [],
        isBooster: true,
      });

      expect(res.allowed).toBe(true);
      expect(res.bonusMultiplier).toBe(2);
    });

    it('should reject accounts younger than minAccountAgeDays', () => {
      const res = engine.validateEntry(
        {
          createdTimestamp: now - 2 * 86_400_000, // 2 days old
          roleIds: [],
        },
        {
          minAccountAgeDays: 7,
        },
      );

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('Your Discord account is too new');
    });

    it('should reject members with insufficient server tenure', () => {
      const res = engine.validateEntry(
        {
          createdTimestamp: now - 30 * 86_400_000,
          joinedTimestamp: now - 1 * 86_400_000, // 1 day tenure
          roleIds: [],
        },
        {
          minServerTenureDays: 5,
        },
      );

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('at least 5 days');
    });

    it('should reject members holding blacklisted roles', () => {
      const res = engine.validateEntry(
        {
          createdTimestamp: now - 30 * 86_400_000,
          roleIds: ['role-muted', 'role-member'],
        },
        {
          blacklistedRoleIds: ['role-muted'],
        },
      );

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('restricted from entering');
    });

    it('should reject members missing required roles', () => {
      const res = engine.validateEntry(
        {
          createdTimestamp: now - 30 * 86_400_000,
          roleIds: ['role-guest'],
        },
        {
          requiredRoleIds: ['role-subscriber', 'role-vip'],
        },
      );

      expect(res.allowed).toBe(false);
      expect(res.reason).toContain('required role');
    });

    it('should compute custom bonus role multiplier', () => {
      const res = engine.validateEntry(
        {
          createdTimestamp: now - 30 * 86_400_000,
          roleIds: ['role-vip', 'role-level50'],
        },
        {
          bonusRoles: [
            { roleId: 'role-vip', multiplier: 3 },
            { roleId: 'role-level50', multiplier: 5 },
          ],
        },
      );

      expect(res.allowed).toBe(true);
      expect(res.bonusMultiplier).toBe(5);
    });
  });

  describe('Lifecycle & Crash Recovery Tick', () => {
    it('should reconcile expired pending giveaways on tick', async () => {
      const onEnded = vi.fn();
      const engine = new GiveawayEngine(mockRepo as GiveawayRepository, {
        onGiveawayEnded: onEnded,
      });

      const expiredGiveaway: Giveaway = {
        id: 'gw-reboot-recovery',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-1',
        prize: 'Nitro Classic',
        winnerCount: 1,
        startsAt: new Date(Date.now() - 7200000),
        endsAt: new Date(Date.now() - 3600000),
        isEnded: false,
        requirements: {},
        createdBy: 'host-1',
      };

      const entries: GiveawayEntry[] = [
        {
          giveawayId: 'gw-reboot-recovery',
          userId: 'lucky-winner',
          bonusMultiplier: 1,
          enteredAt: new Date(),
        },
      ];

      vi.mocked(mockRepo.listExpiredPendingGiveaways!).mockResolvedValue([expiredGiveaway]);
      vi.mocked(mockRepo.findById!).mockResolvedValue(expiredGiveaway);
      vi.mocked(mockRepo.getEntries!).mockResolvedValue(entries);
      vi.mocked(mockRepo.endGiveaway!).mockResolvedValue(undefined);

      const results = await engine.tick();

      expect(results).toHaveLength(1);
      expect(results[0]?.giveaway.id).toBe('gw-reboot-recovery');
      expect(results[0]?.winnerIds).toEqual(['lucky-winner']);
      expect(mockRepo.endGiveaway).toHaveBeenCalledWith('gw-reboot-recovery', ['lucky-winner']);
      expect(onEnded).toHaveBeenCalledTimes(1);
    });

    it('should support rerolling winners excluding past winners', async () => {
      const engine = new GiveawayEngine(mockRepo as GiveawayRepository);

      const endedGiveaway: Giveaway = {
        id: 'gw-ended-reroll',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-2',
        prize: 'Game Pass',
        winnerCount: 1,
        startsAt: new Date(Date.now() - 7200000),
        endsAt: new Date(Date.now() - 3600000),
        isEnded: true,
        requirements: {},
        createdBy: 'host-1',
      };

      const entries: GiveawayEntry[] = [
        {
          giveawayId: 'gw-ended-reroll',
          userId: 'winner-1',
          bonusMultiplier: 1,
          enteredAt: new Date(),
        },
        {
          giveawayId: 'gw-ended-reroll',
          userId: 'winner-2-new',
          bonusMultiplier: 1,
          enteredAt: new Date(),
        },
      ];

      const pastWinners: GiveawayWinner[] = [
        { giveawayId: 'gw-ended-reroll', userId: 'winner-1', wonAt: new Date(), isReroll: false },
      ];

      vi.mocked(mockRepo.findById!).mockResolvedValue(endedGiveaway);
      vi.mocked(mockRepo.getEntries!).mockResolvedValue(entries);
      vi.mocked(mockRepo.getWinners!).mockResolvedValue(pastWinners);
      vi.mocked(mockRepo.recordWinners!).mockResolvedValue([]);

      const rerollResult = await engine.reroll('gw-ended-reroll');

      expect(rerollResult).not.toBeNull();
      expect(rerollResult?.winnerIds).toEqual(['winner-2-new']);
      expect(rerollResult?.isReroll).toBe(true);
      expect(mockRepo.recordWinners).toHaveBeenCalledWith(
        'gw-ended-reroll',
        ['winner-2-new'],
        true,
      );
    });
  });

  describe('UI Embed & Button Formatting', () => {
    const engine = new GiveawayEngine({} as GiveawayRepository);

    it('should format active giveaway embed and button correctly', () => {
      const activeGiveaway: Giveaway = {
        id: 'gw-active',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-active',
        prize: 'Gaming Mouse',
        winnerCount: 2,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
        isEnded: false,
        requirements: { minAccountAgeDays: 3, requiredRoleIds: ['role-gamer'] },
        createdBy: 'admin-1',
      };

      const embed = engine.formatGiveawayEmbed(activeGiveaway, 14);
      expect(embed.title).toContain('Gaming Mouse');
      expect(embed.color).toBe(0x5865f2);
      expect(embed.fields.some((f) => f.name === '🎟️ Entries' && f.value === '14')).toBe(true);
      expect(embed.fields.some((f) => f.name.includes('Requirements'))).toBe(true);

      const button = engine.formatGiveawayButton('gw-active', false, 14);
      expect(button.customId).toBe('giveaway:enter:gw-active');
      expect(button.label).toBe('Enter (14)');
      expect(button.disabled).toBe(false);
      expect(button.style).toBe(1);
    });

    it('should format ended giveaway embed and button correctly', () => {
      const endedGiveaway: Giveaway = {
        id: 'gw-ended',
        guildId: 'guild-1',
        channelId: 'chan-1',
        messageId: 'msg-ended',
        prize: 'Gaming Mouse',
        winnerCount: 1,
        startsAt: new Date(),
        endsAt: new Date(Date.now() - 1000),
        isEnded: true,
        requirements: {},
        createdBy: 'admin-1',
      };

      const embed = engine.formatGiveawayEmbed(endedGiveaway, 25, ['user-champ']);
      expect(embed.title).toContain('GIVEAWAY ENDED');
      expect(embed.color).toBe(0x2b2d31);
      expect(embed.description).toContain('<@user-champ>');

      const button = engine.formatGiveawayButton('gw-ended', true, 25);
      expect(button.disabled).toBe(true);
      expect(button.label).toBe('Giveaway Ended');
    });
  });
});
