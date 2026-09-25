import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Guild, GuildMember } from 'discord.js';
import { createEventBus } from '@ririko/core';
import type { CoreEvents } from '@ririko/core';
import type {
  GuildSettings,
  GuildSettingsRepository,
  ModerationRepository,
  ModerationWarning,
} from '@ririko/database';
import { PermissionService } from './permission.service.js';
import { ModerationActionService } from './moderation-action.service.js';
import {
  WarningEscalationService,
  DEFAULT_ESCALATION_STEPS,
  type EscalationStep,
} from './warning-escalation.service.js';

function createMockGuild() {
  const botMember: Record<string, unknown> = {
    id: 'bot_id',
    permissions: {
      has: vi.fn(() => true),
    },
    roles: {
      highest: { position: 50 },
    },
  };

  const guild: Record<string, unknown> = {
    id: 'guild_1',
    name: 'Test Server',
    ownerId: 'owner_id',
    client: {
      user: { id: 'bot_id' },
    },
    members: {
      me: botMember,
      fetchMe: vi.fn().mockResolvedValue(botMember),
    },
  };

  return guild as unknown as Guild;
}

function createMockMember(id: string, rolePos: number) {
  const member: Record<string, unknown> = {
    id,
    user: { id, tag: `User#${id}`, username: `User_${id}` },
    roles: {
      highest: { position: rolePos },
    },
    permissions: {
      has: vi.fn((_perm: bigint) => true),
    },
    send: vi.fn().mockResolvedValue(undefined),
  };
  return member as unknown as GuildMember;
}

describe('WarningEscalationService — TASK-0711', () => {
  let mockModRepo: {
    createWarning: ReturnType<typeof vi.fn>;
    getActiveWarnings: ReturnType<typeof vi.fn>;
    clearUserWarnings: ReturnType<typeof vi.fn>;
    createCase: ReturnType<typeof vi.fn>;
  };
  let mockGuildSettings: { findById: ReturnType<typeof vi.fn> };
  let permissionService: PermissionService;
  let mockActionService: {
    timeout: ReturnType<typeof vi.fn>;
    kick: ReturnType<typeof vi.fn>;
    ban: ReturnType<typeof vi.fn>;
  };
  let eventBus: ReturnType<typeof createEventBus<CoreEvents>>;
  let escalationService: WarningEscalationService;

  beforeEach(() => {
    mockModRepo = {
      createWarning: vi.fn().mockImplementation(async (data) => ({
        id: 'warning_uuid_1',
        isActive: true,
        createdAt: new Date(),
        ...data,
      })),
      getActiveWarnings: vi.fn().mockResolvedValue([]),
      clearUserWarnings: vi.fn().mockResolvedValue(2),
      createCase: vi.fn().mockResolvedValue({
        id: 'case_uuid_1',
        caseNumber: 10,
      }),
    };

    mockGuildSettings = { findById: vi.fn().mockResolvedValue(null) };
    permissionService = new PermissionService();
    mockActionService = {
      timeout: vi.fn().mockResolvedValue({ success: true, action: 'TIMEOUT' }),
      kick: vi.fn().mockResolvedValue({ success: true, action: 'KICK' }),
      ban: vi.fn().mockResolvedValue({ success: true, action: 'BAN' }),
    };
    eventBus = createEventBus<CoreEvents>();

    escalationService = new WarningEscalationService(
      mockModRepo as unknown as ModerationRepository,
      mockGuildSettings as unknown as GuildSettingsRepository,
      permissionService,
      mockActionService as unknown as ModerationActionService,
      eventBus,
    );
  });

  describe('issueWarning', () => {
    it('issues first warning, sends DM, and does not escalate to punitive action', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 40);
      const target = createMockMember('target_user', 10);

      const activeWarning: ModerationWarning = {
        id: 'w1',
        guildId: 'guild_1',
        userId: 'target_user',
        moderatorId: 'mod_user',
        reason: 'First warning for spam',
        severity: 1,
        isActive: true,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        createdAt: new Date(),
      };
      mockModRepo.getActiveWarnings.mockResolvedValue([activeWarning]);

      const result = await escalationService.issueWarning({
        guild,
        invoker,
        target,
        reason: 'First warning for spam',
        severity: 1,
        expirationDays: 30,
        sendDm: true,
      });

      expect(result.success).toBe(true);
      expect(result.totalActiveWarnings).toBe(1);
      expect(result.cumulativeScore).toBe(1);
      expect(result.escalationTriggered?.action).toBe('WARN');
      expect(result.escalationResult).toBeUndefined(); // No punitive action
      expect(target.send).toHaveBeenCalled();
      expect(mockModRepo.createWarning).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild_1',
          userId: 'target_user',
          severity: 1,
        }),
      );
      expect(mockActionService.timeout).not.toHaveBeenCalled();
    });

    it('triggers automated 10-minute timeout at threshold 3', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 40);
      const target = createMockMember('target_user', 10);

      // User already has 2 warnings, this will be the 3rd
      const activeWarnings: ModerationWarning[] = [
        {
          id: 'w1',
          guildId: 'guild_1',
          userId: 'target_user',
          moderatorId: 'mod_1',
          reason: 'Warn 1',
          severity: 1,
          isActive: true,
          expiresAt: null,
          createdAt: new Date(),
        },
        {
          id: 'w2',
          guildId: 'guild_1',
          userId: 'target_user',
          moderatorId: 'mod_1',
          reason: 'Warn 2',
          severity: 1,
          isActive: true,
          expiresAt: null,
          createdAt: new Date(),
        },
        {
          id: 'w3',
          guildId: 'guild_1',
          userId: 'target_user',
          moderatorId: 'mod_user',
          reason: 'Warn 3',
          severity: 1,
          isActive: true,
          expiresAt: null,
          createdAt: new Date(),
        },
      ];
      mockModRepo.getActiveWarnings.mockResolvedValue(activeWarnings);

      const result = await escalationService.issueWarning({
        guild,
        invoker,
        target,
        reason: 'Excessive caps',
      });

      expect(result.success).toBe(true);
      expect(result.cumulativeScore).toBe(3);
      expect(result.escalationTriggered).toEqual(
        expect.objectContaining({
          warnThreshold: 3,
          action: 'TIMEOUT',
          durationSeconds: 600,
        }),
      );
      expect(mockActionService.timeout).toHaveBeenCalledWith(
        expect.objectContaining({
          guild,
          invoker,
          target,
          durationSeconds: 600,
          sendDm: false,
        }),
      );
    });

    it('immediately triggers escalation when single warning has high severity weight', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 40);
      const target = createMockMember('target_user', 10);

      // Single major infraction with severity 3
      const activeWarnings: ModerationWarning[] = [
        {
          id: 'w1',
          guildId: 'guild_1',
          userId: 'target_user',
          moderatorId: 'mod_user',
          reason: 'Severe harassment',
          severity: 3, // Immediately hits threshold 3
          isActive: true,
          expiresAt: null,
          createdAt: new Date(),
        },
      ];
      mockModRepo.getActiveWarnings.mockResolvedValue(activeWarnings);

      const result = await escalationService.issueWarning({
        guild,
        invoker,
        target,
        reason: 'Severe harassment',
        severity: 3,
      });

      expect(result.cumulativeScore).toBe(3);
      expect(result.escalationTriggered?.action).toBe('TIMEOUT');
      expect(mockActionService.timeout).toHaveBeenCalledWith(
        expect.objectContaining({
          durationSeconds: 600,
        }),
      );
    });

    it('triggers ban when cumulative score reaches threshold 6', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('admin_user', 40);
      const target = createMockMember('target_user', 10);

      const activeWarnings: ModerationWarning[] = Array.from({ length: 6 }, (_, i) => ({
        id: `w_${i}`,
        guildId: 'guild_1',
        userId: 'target_user',
        moderatorId: 'mod_1',
        reason: `Infraction ${i + 1}`,
        severity: 1,
        isActive: true,
        expiresAt: null,
        createdAt: new Date(),
      }));
      mockModRepo.getActiveWarnings.mockResolvedValue(activeWarnings);

      const result = await escalationService.issueWarning({
        guild,
        invoker,
        target,
        reason: 'Final infraction',
      });

      expect(result.cumulativeScore).toBe(6);
      expect(result.escalationTriggered?.action).toBe('BAN');
      expect(mockActionService.ban).toHaveBeenCalledWith(
        expect.objectContaining({
          guild,
          invoker,
          target,
          sendDm: false,
        }),
      );
    });

    it('fails when invoker lacks permission or violates role hierarchy', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 10);
      const target = createMockMember('target_user', 30); // Higher role!

      const result = await escalationService.issueWarning({
        guild,
        invoker,
        target,
        reason: 'Unauthorized attempt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('highest role');
      expect(mockModRepo.createWarning).not.toHaveBeenCalled();
    });
  });

  describe('evaluateEscalation', () => {
    it('accurately computes current score and points to next threshold', async () => {
      const activeWarnings: ModerationWarning[] = [
        {
          id: 'w1',
          guildId: 'guild_1',
          userId: 'user_1',
          moderatorId: 'mod_1',
          reason: 'Warn 1',
          severity: 1,
          isActive: true,
          expiresAt: null,
          createdAt: new Date(),
        },
      ];
      mockModRepo.getActiveWarnings.mockResolvedValue(activeWarnings);

      const evalResult = await escalationService.evaluateEscalation('guild_1', 'user_1');

      expect(evalResult.activeCount).toBe(1);
      expect(evalResult.cumulativeScore).toBe(1);
      expect(evalResult.triggeredStep?.action).toBe('WARN');
      expect(evalResult.nextStep?.warnThreshold).toBe(2);
      expect(evalResult.pointsToNextStep).toBe(1); // 2 - 1 = 1 point to next step
    });
  });

  describe('Custom Escalation Policy', () => {
    it('returns default policy when no custom policy is configured', async () => {
      const policy = await escalationService.getEscalationPolicy('guild_1');
      expect(policy).toEqual(DEFAULT_ESCALATION_STEPS);
    });

    it('reads the policy saved in guild_settings.escalation_steps (TASK-1142)', async () => {
      const customPolicy: EscalationStep[] = [
        { warnThreshold: 2, action: 'TIMEOUT', durationSeconds: 300 },
        { warnThreshold: 4, action: 'KICK' },
      ];
      mockGuildSettings.findById.mockResolvedValue({
        escalationSteps: customPolicy,
      } as Partial<GuildSettings>);

      expect(await escalationService.getEscalationPolicy('guild_1')).toEqual(customPolicy);
      expect(mockGuildSettings.findById).toHaveBeenCalledWith('guild_1');
      mockModRepo.getActiveWarnings.mockResolvedValue([
        { severity: 2 },
        { severity: 1 },
      ] as ModerationWarning[]);
      const evaluation = await escalationService.evaluateEscalation('guild_1', 'user_1');
      expect(evaluation.triggeredStep).toEqual(customPolicy[0]);
    });

    it('never escalates when the guild saved an empty policy', async () => {
      mockGuildSettings.findById.mockResolvedValue({
        escalationSteps: [],
      } as Partial<GuildSettings>);
      mockModRepo.getActiveWarnings.mockResolvedValue([{ severity: 5 }] as ModerationWarning[]);
      const evaluation = await escalationService.evaluateEscalation('guild_1', 'user_1');
      expect(evaluation.triggeredStep).toBeUndefined();
    });

    it('does not fall back to the default policy when the settings cannot be read', async () => {
      mockGuildSettings.findById.mockRejectedValue(new Error('database is locked'));
      await expect(escalationService.getEscalationPolicy('guild_1')).rejects.toThrow('locked');
    });
  });

  describe('clearWarnings', () => {
    it('deactivates active warnings and emits moderation:actionExecuted event', async () => {
      const eventSpy = vi.fn();
      eventBus.on('moderation:actionExecuted', eventSpy);

      const count = await escalationService.clearWarnings(
        'guild_1',
        'target_user',
        'mod_admin',
        'Good behavior appeal',
      );

      expect(count).toBe(2);
      expect(mockModRepo.clearUserWarnings).toHaveBeenCalledWith('guild_1', 'target_user');
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'WARN',
          guildId: 'guild_1',
          targetUserId: 'target_user',
          moderatorUserId: 'mod_admin',
          reason: expect.stringContaining('Cleared 2 warning(s)'),
        }),
      );
    });
  });
});
