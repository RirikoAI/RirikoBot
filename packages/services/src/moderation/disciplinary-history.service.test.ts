import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEventBus } from '@ririko/core';
import type { CoreEvents } from '@ririko/core';
import type {
  ModerationCase,
  ModerationWarning,
  ModerationNote,
  ModerationRepository,
  GuildSettingsRepository,
} from '@ririko/database';
import type { Guild, Client, GuildTextBasedChannel, User, Message } from 'discord.js';
import { ModerationLogService, MODERATION_COLORS } from './moderation-log.service.js';
import { DisciplinaryHistoryService } from './disciplinary-history.service.js';

describe('Moderation Audit Logging & Disciplinary History — TASK-0702', () => {
  let mockModRepo: {
    getCaseByNumber: ReturnType<typeof vi.fn>;
    listCases: ReturnType<typeof vi.fn>;
    getActiveWarnings: ReturnType<typeof vi.fn>;
    createNote: ReturnType<typeof vi.fn>;
    getNotesByUser: ReturnType<typeof vi.fn>;
    deleteNote: ReturnType<typeof vi.fn>;
  };
  let mockGuildSettingsRepo: {
    getByGuildId: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockModRepo = {
      getCaseByNumber: vi.fn(),
      listCases: vi.fn(),
      getActiveWarnings: vi.fn(),
      createNote: vi.fn(),
      getNotesByUser: vi.fn(),
      deleteNote: vi.fn(),
    };
    mockGuildSettingsRepo = {
      getByGuildId: vi.fn(),
    };
  });

  describe('ModerationLogService', () => {
    let logService: ModerationLogService;
    let eventBus: ReturnType<typeof createEventBus<CoreEvents>>;

    beforeEach(() => {
      eventBus = createEventBus<CoreEvents>();
      logService = new ModerationLogService(
        mockModRepo as unknown as ModerationRepository,
        mockGuildSettingsRepo as unknown as GuildSettingsRepository,
        eventBus,
      );
    });

    it('builds rich case embed with proper colors and field structure', () => {
      const sampleCase: ModerationCase = {
        id: 'case_123',
        guildId: 'guild_1',
        caseNumber: 1042,
        type: 'BAN',
        targetUserId: 'user_target',
        moderatorUserId: 'user_mod',
        reason: 'Severe server raid involvement',
        durationSeconds: null,
        metadata: { deleteMessageDays: 2 },
        createdAt: new Date('2026-09-17T06:00:00Z'),
      };

      const embed = logService.buildCaseEmbed(sampleCase, {
        targetUser: { id: 'user_target', tag: 'Spammer#0001' } as unknown as User,
        moderatorUser: { id: 'user_mod', tag: 'Admin#1337' } as unknown as User,
      });

      const json = embed.toJSON();
      expect(json.title).toBe('Case #1042 | BAN');
      expect(json.color).toBe(MODERATION_COLORS.BAN);
      expect(json.footer?.text).toBe('Case ID: case_123');

      const targetField = json.fields?.find((f) => f.name === 'Target User');
      expect(targetField?.value).toContain('Spammer#0001');

      const modField = json.fields?.find((f) => f.name === 'Moderator');
      expect(modField?.value).toContain('Admin#1337');

      const purgedField = json.fields?.find((f) => f.name === 'Messages Purged');
      expect(purgedField?.value).toBe('2 day(s)');
    });

    it('returns null if logChannelId is not configured in guild settings', async () => {
      mockGuildSettingsRepo.getByGuildId.mockResolvedValue({
        guildId: 'guild_1',
        logChannelId: null,
      });

      const mockGuild = {
        id: 'guild_1',
      } as Guild;

      const sampleCase: ModerationCase = {
        id: 'case_1',
        guildId: 'guild_1',
        caseNumber: 1,
        type: 'WARN',
        targetUserId: 'user_1',
        moderatorUserId: 'mod_1',
        reason: 'Warning',
        durationSeconds: null,
        metadata: {},
        createdAt: new Date(),
      };

      const result = await logService.logCase(mockGuild, sampleCase);
      expect(result).toBeNull();
    });

    it('dispatches embed to configured log channel when permissions are valid', async () => {
      mockGuildSettingsRepo.getByGuildId.mockResolvedValue({
        guildId: 'guild_1',
        logChannelId: 'channel_log_999',
      });

      const mockTextChannel = {
        id: 'channel_log_999',
        isTextBased: () => true,
        permissionsFor: vi.fn().mockReturnValue({
          has: vi.fn(() => true),
        }),
        send: vi.fn().mockResolvedValue({ id: 'msg_sent_1' }),
      } as unknown as GuildTextBasedChannel;

      const mockGuild = {
        id: 'guild_1',
        channels: {
          fetch: vi.fn().mockResolvedValue(mockTextChannel),
        },
        members: {
          me: { id: 'bot_id' },
          fetchMe: vi.fn(),
        },
        client: {
          users: {
            fetch: vi.fn().mockResolvedValue({ id: 'some_user', tag: 'User#1234' }),
          },
        },
      } as unknown as Guild;

      const sampleCase: ModerationCase = {
        id: 'case_1',
        guildId: 'guild_1',
        caseNumber: 5,
        type: 'KICK',
        targetUserId: 'user_target',
        moderatorUserId: 'user_mod',
        reason: 'Spamming',
        durationSeconds: null,
        metadata: {},
        createdAt: new Date(),
      };

      const result = await logService.logCase(mockGuild, sampleCase);
      expect(result).not.toBeNull();
      expect(mockTextChannel.send).toHaveBeenCalled();
    });

    it('automatically dispatches log when moderation:caseCreated event fires', async () => {
      const sampleCase: ModerationCase = {
        id: 'case_42',
        guildId: 'guild_1',
        caseNumber: 42,
        type: 'TIMEOUT',
        targetUserId: 'user_target',
        moderatorUserId: 'user_mod',
        reason: 'Inappropriate language',
        durationSeconds: 600,
        metadata: {},
        createdAt: new Date(),
      };

      mockModRepo.getCaseByNumber.mockResolvedValue(sampleCase);
      const logCaseSpy = vi
        .spyOn(logService, 'logCase')
        .mockResolvedValue({} as unknown as Message);

      const mockGuild = { id: 'guild_1' };
      const mockClient = {
        guilds: {
          cache: new Map([['guild_1', mockGuild]]),
          fetch: vi.fn().mockResolvedValue(mockGuild),
        },
      } as unknown as Client;

      logService.startListening(mockClient);

      await eventBus.emit('moderation:caseCreated', {
        guildId: 'guild_1',
        caseNumber: 42,
        type: 'TIMEOUT',
        targetUserId: 'user_target',
        moderatorUserId: 'user_mod',
        reason: 'Inappropriate language',
        durationSeconds: 600,
      });

      // Allow event bus async listener to trigger
      await new Promise((r) => setTimeout(r, 10));

      expect(mockModRepo.getCaseByNumber).toHaveBeenCalledWith('guild_1', 42);
      expect(logCaseSpy).toHaveBeenCalledWith(mockGuild, sampleCase);
    });
  });

  describe('DisciplinaryHistoryService', () => {
    let historyService: DisciplinaryHistoryService;

    beforeEach(() => {
      historyService = new DisciplinaryHistoryService(
        mockModRepo as unknown as ModerationRepository,
      );
    });

    it('aggregates summary and computes risk level correctly', async () => {
      const activeWarnings: ModerationWarning[] = [
        {
          id: 'w1',
          guildId: 'guild_1',
          userId: 'user_bad',
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
          userId: 'user_bad',
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
          userId: 'user_bad',
          moderatorId: 'mod_1',
          reason: 'Warn 3',
          severity: 1,
          isActive: true,
          expiresAt: null,
          createdAt: new Date(),
        },
      ];

      const cases: ModerationCase[] = [
        {
          id: 'c1',
          guildId: 'guild_1',
          caseNumber: 1,
          type: 'WARN',
          targetUserId: 'user_bad',
          moderatorUserId: 'mod_1',
          reason: 'Warn 1',
          durationSeconds: null,
          metadata: {},
          createdAt: new Date(),
        },
        {
          id: 'c2',
          guildId: 'guild_1',
          caseNumber: 2,
          type: 'TIMEOUT',
          targetUserId: 'user_bad',
          moderatorUserId: 'mod_1',
          reason: 'Timeout 1',
          durationSeconds: 300,
          metadata: {},
          createdAt: new Date(),
        },
        {
          id: 'c3',
          guildId: 'guild_1',
          caseNumber: 3,
          type: 'KICK',
          targetUserId: 'user_bad',
          moderatorUserId: 'mod_2',
          reason: 'Kicked for spam',
          durationSeconds: null,
          metadata: {},
          createdAt: new Date(),
        },
      ];

      const notes: ModerationNote[] = [
        {
          id: 'n1',
          guildId: 'guild_1',
          targetUserId: 'user_bad',
          authorUserId: 'mod_1',
          content: 'User was warned twice previously in ticket.',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockModRepo.getActiveWarnings.mockResolvedValue(activeWarnings);
      mockModRepo.listCases.mockResolvedValue({
        items: cases,
        total: 3,
        limit: 100,
        offset: 0,
      });
      mockModRepo.getNotesByUser.mockResolvedValue(notes);

      const summary = await historyService.getSummary('guild_1', 'user_bad');

      expect(summary.guildId).toBe('guild_1');
      expect(summary.userId).toBe('user_bad');
      expect(summary.activeWarnings).toHaveLength(3);
      expect(summary.statistics.activeWarningCount).toBe(3);
      expect(summary.statistics.timeoutCount).toBe(1);
      expect(summary.statistics.kickCount).toBe(1);
      expect(summary.statistics.totalInfractions).toBe(3);
      expect(summary.riskLevel).toBe('HIGH'); // Kick count > 0 & 3 active warnings
      expect(summary.notes).toHaveLength(1);
    });

    it('builds history embed with user tag and infraction details', async () => {
      const summary = {
        guildId: 'guild_1',
        userId: 'user_123',
        activeWarnings: [],
        cases: [
          {
            id: 'c1',
            guildId: 'guild_1',
            caseNumber: 1,
            type: 'WARN',
            targetUserId: 'user_123',
            moderatorUserId: 'mod_admin',
            reason: 'Rule break',
            durationSeconds: null,
            metadata: {},
            createdAt: new Date(),
          },
        ],
        notes: [
          {
            id: 'n1',
            guildId: 'guild_1',
            targetUserId: 'user_123',
            authorUserId: 'mod_admin',
            content: 'First offense noted',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        statistics: {
          activeWarningCount: 0,
          totalWarningCount: 1,
          timeoutCount: 0,
          kickCount: 0,
          banCount: 0,
          totalInfractions: 1,
        },
        riskLevel: 'LOW' as const,
      };

      const mockUser = {
        id: 'user_123',
        tag: 'GoodUser#0001',
        displayAvatarURL: () => 'https://example.com/avatar.png',
      };

      const embed = historyService.buildHistoryEmbed(summary, mockUser as unknown as User);
      const json = embed.toJSON();

      expect(json.title).toContain('GoodUser#0001');
      expect(json.description).toContain('user_123');

      const riskField = json.fields?.find((f) => f.name === 'Risk Level');
      expect(riskField?.value).toBe('**LOW**');

      const casesField = json.fields?.find((f) => f.name === 'Recent Cases');
      expect(casesField?.value).toContain('Case #1');

      const notesField = json.fields?.find((f) => f.name?.startsWith('Staff Notes'));
      expect(notesField?.value).toContain('First offense noted');
    });

    it('supports staff notes CRUD operations', async () => {
      const createdNote: ModerationNote = {
        id: 'note_uuid',
        guildId: 'guild_1',
        targetUserId: 'user_1',
        authorUserId: 'mod_1',
        content: 'Staff observation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockModRepo.createNote.mockResolvedValue(createdNote);
      mockModRepo.getNotesByUser.mockResolvedValue([createdNote]);
      mockModRepo.deleteNote.mockResolvedValue(true);

      const added = await historyService.addNote('guild_1', 'user_1', 'mod_1', 'Staff observation');
      expect(added.id).toBe('note_uuid');
      expect(mockModRepo.createNote).toHaveBeenCalledWith({
        guildId: 'guild_1',
        targetUserId: 'user_1',
        authorUserId: 'mod_1',
        content: 'Staff observation',
      });

      const notes = await historyService.getNotes('guild_1', 'user_1');
      expect(notes).toHaveLength(1);

      const deleted = await historyService.deleteNote('note_uuid');
      expect(deleted).toBe(true);
      expect(mockModRepo.deleteNote).toHaveBeenCalledWith('note_uuid');
    });
  });
});
