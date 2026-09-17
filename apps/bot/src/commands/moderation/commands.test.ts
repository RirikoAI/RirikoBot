import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandCategory } from '@ririko/discord';
import {
  createModerationCommands,
  parseDurationToSeconds,
  formatDurationSeconds,
} from './commands.js';
import type { BotServices } from '../../services.js';

describe('Moderation Commands Suite', () => {
  describe('Helper Functions', () => {
    it('parseDurationToSeconds should parse valid duration units', () => {
      expect(parseDurationToSeconds('30s')).toBe(30);
      expect(parseDurationToSeconds('10m')).toBe(600);
      expect(parseDurationToSeconds('2h')).toBe(7200);
      expect(parseDurationToSeconds('1d')).toBe(86400);
      expect(parseDurationToSeconds('1w')).toBe(604800);
      expect(parseDurationToSeconds('120')).toBe(120);
    });

    it('parseDurationToSeconds should return null on invalid inputs', () => {
      expect(parseDurationToSeconds('')).toBeNull();
      expect(parseDurationToSeconds('abc')).toBeNull();
      expect(parseDurationToSeconds('-10m')).toBeNull();
      expect(parseDurationToSeconds('0')).toBeNull();
    });

    it('formatDurationSeconds should format readable strings', () => {
      expect(formatDurationSeconds(45)).toBe('45 seconds');
      expect(formatDurationSeconds(600)).toBe('10 minutes');
      expect(formatDurationSeconds(7200)).toBe('2 hours');
      expect(formatDurationSeconds(172800)).toBe('2 days');
    });
  });

  describe('Command Registration & Execution', () => {
    let mockServices: Partial<BotServices>;
    let commands: ReturnType<typeof createModerationCommands>;

    beforeEach(() => {
      mockServices = {
        warningEscalationService: {
          issueWarning: vi.fn().mockResolvedValue({
            success: true,
            caseNumber: 101,
            totalActiveWarnings: 2,
            cumulativeScore: 2,
            dmSent: true,
          }),
        } as any,
        moderationActionService: {
          timeout: vi.fn().mockResolvedValue({ success: true, caseNumber: 102 }),
          untimeout: vi.fn().mockResolvedValue({ success: true }),
          kick: vi.fn().mockResolvedValue({ success: true, caseNumber: 103 }),
          softban: vi.fn().mockResolvedValue({ success: true, caseNumber: 104 }),
          ban: vi.fn().mockResolvedValue({ success: true, caseNumber: 105 }),
          unban: vi.fn().mockResolvedValue({ success: true }),
          lockChannel: vi.fn().mockResolvedValue({ success: true }),
          unlockChannel: vi.fn().mockResolvedValue({ success: true }),
          setNickname: vi.fn().mockResolvedValue({ success: true }),
        } as any,
        purgeService: {
          purgeMessages: vi.fn().mockResolvedValue({
            success: true,
            deletedCount: 15,
            skippedOlderThan14Days: 2,
          }),
        } as any,
        disciplinaryHistoryService: {
          getSummary: vi.fn().mockResolvedValue({
            activeWarningCount: 1,
            riskLevel: 'LOW',
            cases: [],
          }),
          buildHistoryEmbed: vi.fn().mockReturnValue({ toJSON: () => ({ title: 'History' }) }),
          addNote: vi.fn().mockResolvedValue({ content: 'Test note' }),
        } as any,
        moderationRepo: {
          getNotesByUser: vi.fn().mockResolvedValue([]),
          upsertRule: vi.fn().mockResolvedValue({}),
        } as any,
        autoModService: {
          getGuildRuleConfigs: vi.fn().mockResolvedValue(new Map()),
          invalidateRuleCache: vi.fn(),
        } as any,
        antiRaidService: {
          getConfig: vi.fn().mockReturnValue({
            enabled: true,
            joinThreshold: 10,
            windowSeconds: 10,
            freshAccountAgeHours: 24,
          }),
          getState: vi.fn().mockReturnValue({ status: 'NORMAL' }),
        } as any,
      };

      commands = createModerationCommands(mockServices as BotServices);
    });

    it('should register 14 moderation commands with MODERATION category', () => {
      expect(commands).toHaveLength(14);
      for (const cmd of commands) {
        expect(cmd.metadata.category).toBe(CommandCategory.MODERATION);
      }
    });

    it('warn command should call issueWarning and reply with embed', async () => {
      const warnCmd = commands.find((c) => c.metadata.name === 'warn')!;
      const replyFn = vi.fn();

      const mockCtx: any = {
        guild: {
          id: 'guild-1',
          members: {
            fetch: vi.fn().mockResolvedValue({
              id: 'target-1',
              user: { tag: 'Target#0001' },
            }),
          },
        },
        user: { id: 'invoker-1' },
        member: { id: 'invoker-1' },
        options: {
          getUser: vi.fn().mockReturnValue({ id: 'target-1', tag: 'Target#0001' }),
          getString: vi.fn().mockReturnValue('Spamming chat'),
          getInteger: vi.fn().mockReturnValue(1),
          getBoolean: vi.fn().mockReturnValue(true),
        },
        reply: replyFn,
      };

      await warnCmd.execute(mockCtx);

      expect(mockServices.warningEscalationService!.issueWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Spamming chat',
          severity: 1,
          sendDm: true,
        }),
      );
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('timeout command should parse duration and call timeout', async () => {
      const timeoutCmd = commands.find((c) => c.metadata.name === 'timeout')!;
      const replyFn = vi.fn();

      const mockCtx: any = {
        guild: {
          id: 'guild-1',
          members: {
            fetch: vi.fn().mockResolvedValue({
              id: 'target-1',
              user: { tag: 'Target#0001' },
            }),
          },
        },
        user: { id: 'invoker-1' },
        member: { id: 'invoker-1' },
        options: {
          getUser: vi.fn().mockReturnValue({ id: 'target-1', tag: 'Target#0001' }),
          getString: vi.fn((key: string) => (key === 'duration' ? '10m' : 'Trolling')),
          getBoolean: vi.fn().mockReturnValue(true),
        },
        reply: replyFn,
      };

      await timeoutCmd.execute(mockCtx);

      expect(mockServices.moderationActionService!.timeout).toHaveBeenCalledWith(
        expect.objectContaining({
          durationSeconds: 600,
          reason: 'Trolling',
        }),
      );
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('purge command should call purge and reply with report', async () => {
      const purgeCmd = commands.find((c) => c.metadata.name === 'purge')!;
      const replyFn = vi.fn();

      const mockCtx: any = {
        guild: { id: 'guild-1' },
        channel: { id: 'chan-1' },
        user: { id: 'invoker-1' },
        member: { id: 'invoker-1' },
        options: {
          getInteger: vi.fn().mockReturnValue(20),
          getUser: vi.fn().mockReturnValue(null),
          getBoolean: vi.fn().mockReturnValue(false),
        },
        reply: replyFn,
      };

      await purgeCmd.execute(mockCtx);

      expect(mockServices.purgeService!.purgeMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 20,
        }),
      );
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('deleted **15** messages'),
        }),
      );
    });

    it('history command should retrieve history and reply with embed', async () => {
      const historyCmd = commands.find((c) => c.metadata.name === 'history')!;
      const replyFn = vi.fn();

      const mockCtx: any = {
        guild: { id: 'guild-1' },
        options: {
          getUser: vi.fn().mockResolvedValue({ id: 'target-1', tag: 'Target#0001' }),
        },
        reply: replyFn,
      };

      await historyCmd.execute(mockCtx);

      expect(mockServices.disciplinaryHistoryService!.getSummary).toHaveBeenCalledWith(
        'guild-1',
        'target-1',
      );
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('automod command should handle status inspection', async () => {
      const automodCmd = commands.find((c) => c.metadata.name === 'automod')!;
      const replyFn = vi.fn();

      const mockCtx: any = {
        guild: { id: 'guild-1', name: 'Test Server' },
        options: {
          getString: vi.fn((key: string) => (key === 'action' ? 'status' : null)),
        },
        reply: replyFn,
      };

      await automodCmd.execute(mockCtx);

      expect(mockServices.autoModService!.getGuildRuleConfigs).toHaveBeenCalledWith('guild-1');
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });
  });
});
