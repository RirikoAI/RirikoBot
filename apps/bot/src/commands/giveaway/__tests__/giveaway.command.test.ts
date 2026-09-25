import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { createGiveawayCommands, parseGiveawayDuration } from '../giveaway.command.js';
import { handleGiveawayButtonInteraction } from '../components.js';
import type { BotServices } from '../../../services.js';
import type { Giveaway } from '@ririko/database';

describe('Giveaway Commands & Components Suite (TASK-0902)', () => {
  let mockServices: Partial<BotServices>;

  const sampleGiveaway: Giveaway = {
    id: 'gw-test-1',
    guildId: 'guild-1',
    channelId: 'channel-gw',
    messageId: 'msg-gw-1',
    prize: 'Discord Nitro 1 Month',
    winnerCount: 1,
    startsAt: new Date('2026-09-17T20:00:00.000Z'),
    endsAt: new Date('2026-09-18T20:00:00.000Z'),
    isEnded: false,
    requirements: {},
    createdBy: 'user-host',
  };

  beforeEach(() => {
    mockServices = {
      giveawayRepo: {
        findById: vi.fn().mockImplementation((id: string) => {
          if (id === sampleGiveaway.id || id === sampleGiveaway.messageId) {
            return Promise.resolve({ ...sampleGiveaway });
          }
          return Promise.resolve(null);
        }),
        findByMessageId: vi.fn().mockImplementation((msgId: string) => {
          if (msgId === sampleGiveaway.messageId) {
            return Promise.resolve({ ...sampleGiveaway });
          }
          return Promise.resolve(null);
        }),
        create: vi.fn().mockResolvedValue({ ...sampleGiveaway }),
        update: vi
          .fn()
          .mockImplementation((id, data) => Promise.resolve({ ...sampleGiveaway, ...data })),
        delete: vi.fn().mockResolvedValue(true),
        listActiveGiveaways: vi.fn().mockResolvedValue([sampleGiveaway]),
        getEntries: vi.fn().mockResolvedValue([]),
        getEntryCount: vi.fn().mockResolvedValue(5),
        hasUserEntered: vi.fn().mockResolvedValue(false),
        addEntry: vi.fn().mockResolvedValue(true),
        recordWinners: vi.fn().mockResolvedValue([]),
        getWinners: vi.fn().mockResolvedValue([]),
      } as any,
      giveawayEngine: {
        createGiveaway: vi.fn().mockResolvedValue({ ...sampleGiveaway }),
        rollAndEndGiveaway: vi.fn().mockResolvedValue({
          giveaway: { ...sampleGiveaway, isEnded: true },
          winnerIds: ['user-winner-1'],
          isReroll: false,
        }),
        reroll: vi.fn().mockResolvedValue({
          giveaway: sampleGiveaway,
          winnerIds: ['user-winner-2'],
          isReroll: true,
        }),
        validateEntry: vi.fn().mockReturnValue({ allowed: true, bonusMultiplier: 1 }),
        formatGiveawayEmbed: vi.fn().mockReturnValue({
          title: '🎉 GIVEAWAY: Discord Nitro 1 Month',
          description: 'Click to enter',
          color: 0x5865f2,
          fields: [],
          footer: { text: 'ID: gw-test-1' },
          timestamp: new Date(),
        }),
        formatGiveawayButton: vi.fn().mockReturnValue({
          customId: 'giveaway:enter:gw-test-1',
          label: 'Enter (5)',
          style: 1,
          disabled: false,
          emoji: { name: '🎉' },
        }),
      } as any,
    };
  });

  describe('Duration Parser Utility', () => {
    it('should parse standard time units accurately', () => {
      expect(parseGiveawayDuration('30s')).toBe(30_000);
      expect(parseGiveawayDuration('15m')).toBe(15 * 60 * 1000);
      expect(parseGiveawayDuration('2h')).toBe(2 * 60 * 60 * 1000);
      expect(parseGiveawayDuration('1d')).toBe(24 * 60 * 60 * 1000);
      expect(parseGiveawayDuration('1w')).toBe(7 * 24 * 60 * 60 * 1000);
      expect(parseGiveawayDuration('0.5h')).toBe(30 * 60 * 1000);
    });

    it('should return null for invalid inputs', () => {
      expect(parseGiveawayDuration('abc')).toBeNull();
      expect(parseGiveawayDuration('-5m')).toBeNull();
      expect(parseGiveawayDuration('')).toBeNull();
    });
  });

  describe('Command Registration & Aliases', () => {
    it('should register primary /giveaway command and all legacy aliases', () => {
      const commands = createGiveawayCommands(mockServices as BotServices);
      expect(commands).toHaveLength(7);

      const names = commands.map((c) => c.metadata.name);
      expect(names).toContain('giveaway');
      expect(names).toContain('gcreate');
      expect(names).toContain('gend');
      expect(names).toContain('greroll');
      expect(names).toContain('gdelete');
      expect(names).toContain('gedit');
      expect(names).toContain('glist');
    });

    it('enforces ManageMessages or ManageGuild permission for admin actions', async () => {
      const commands = createGiveawayCommands(mockServices as BotServices);
      const giveawayCmd = commands.find((c) => c.metadata.name === 'giveaway')!;

      const mockCtx: any = {
        guildId: 'guild-1',
        user: { id: 'user-host' },
        member: {
          permissions: {
            has: vi.fn().mockReturnValue(false),
          },
        },
        options: {
          getString: vi.fn().mockImplementation((name) => (name === 'action' ? 'create' : null)),
          getInteger: vi.fn().mockReturnValue(null),
          getChannel: vi.fn().mockResolvedValue(null),
          getRawArgs: vi.fn().mockReturnValue(['create']),
        },
        args: ['create'],
        reply: vi.fn(),
      };

      await giveawayCmd.execute(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Manage Messages'),
        }),
      );
    });
  });

  describe('Subcommands Execution', () => {
    function createMockContext(
      action: string,
      options: Record<string, any> = {},
      args: string[] = [],
    ): any {
      const sentMsg = {
        id: 'msg-new-123',
        url: 'https://discord.com/channels/1/2/3',
      };
      const mockChannel = {
        id: 'channel-target',
        send: vi.fn().mockResolvedValue(sentMsg),
      };

      return {
        guildId: 'guild-1',
        userId: 'user-host',
        user: { id: 'user-host' },
        channelId: 'channel-target',
        channel: mockChannel,
        member: {
          permissions: {
            has: vi.fn().mockReturnValue(true),
          },
        },
        options: {
          getString: vi.fn().mockImplementation((name: string) => {
            if (name === 'action') return action;
            return options[name] ?? null;
          }),
          getInteger: vi.fn().mockImplementation((name: string) => options[name] ?? null),
          getChannel: vi.fn().mockResolvedValue(options.channel ?? mockChannel),
          getRawArgs: vi.fn().mockReturnValue([action, ...args]),
        },
        args: [action, ...args],
        reply: vi.fn(),
        source: 'slash',
        raw: { options: { getRole: () => null } },
      };
    }

    it('successfully creates a giveaway', async () => {
      const commands = createGiveawayCommands(mockServices as BotServices);
      const giveawayCmd = commands.find((c) => c.metadata.name === 'giveaway')!;

      const mockCtx = createMockContext('create', {
        prize: 'Gaming Keyboard',
        duration: '2h',
        winners: 2,
      });

      await giveawayCmd.execute(mockCtx);

      expect(mockServices.giveawayEngine!.createGiveaway).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-1',
          channelId: 'channel-target',
          prize: 'Gaming Keyboard',
          winnerCount: 2,
          durationMs: 7_200_000,
          createdBy: 'user-host',
        }),
      );

      expect(mockCtx.channel.send).toHaveBeenCalled();
      expect(mockServices.giveawayRepo!.update).toHaveBeenCalledWith('gw-test-1', {
        messageId: 'msg-new-123',
      });
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Giveaway created successfully'),
        }),
      );
    });

    it('successfully ends an active giveaway', async () => {
      const commands = createGiveawayCommands(mockServices as BotServices);
      const giveawayCmd = commands.find((c) => c.metadata.name === 'giveaway')!;

      const mockCtx = createMockContext('end', {
        giveaway: 'gw-test-1',
      });

      await giveawayCmd.execute(mockCtx);

      expect(mockServices.giveawayEngine!.rollAndEndGiveaway).toHaveBeenCalledWith('gw-test-1');
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Winner(s)'),
        }),
      );
    });

    it('successfully rerolls winners for an ended giveaway', async () => {
      const commands = createGiveawayCommands(mockServices as BotServices);
      const giveawayCmd = commands.find((c) => c.metadata.name === 'giveaway')!;

      vi.mocked(mockServices.giveawayRepo!.findById).mockResolvedValue({
        ...sampleGiveaway,
        isEnded: true,
      });

      const mockCtx = createMockContext('reroll', {
        giveaway: 'gw-test-1',
        winners: 1,
      });
      mockCtx.client = {
        channels: {
          fetch: vi.fn().mockResolvedValue({
            isTextBased: () => true,
            send: vi.fn().mockResolvedValue({}),
          }),
        },
      };

      await giveawayCmd.execute(mockCtx);

      expect(mockServices.giveawayEngine!.reroll).toHaveBeenCalledWith('gw-test-1', 1);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('New winner(s)'),
        }),
      );
    });

    it('lists active server giveaways', async () => {
      const commands = createGiveawayCommands(mockServices as BotServices);
      const giveawayCmd = commands.find((c) => c.metadata.name === 'giveaway')!;

      const mockCtx = createMockContext('list');

      await giveawayCmd.execute(mockCtx);

      expect(mockServices.giveawayRepo!.listActiveGiveaways).toHaveBeenCalledWith('guild-1');
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('deletes a giveaway', async () => {
      const commands = createGiveawayCommands(mockServices as BotServices);
      const giveawayCmd = commands.find((c) => c.metadata.name === 'giveaway')!;

      const mockCtx = createMockContext('delete', {
        giveaway: 'gw-test-1',
      });
      mockCtx.client = {
        channels: {
          fetch: vi.fn().mockResolvedValue(null),
        },
      };

      await giveawayCmd.execute(mockCtx);

      expect(mockServices.giveawayRepo!.delete).toHaveBeenCalledWith('gw-test-1');
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('deleted'),
        }),
      );
    });
  });

  describe('Interactive Component Buttons (handleGiveawayButtonInteraction)', () => {
    it('successfully processes user entry on button click', async () => {
      const mockMsg = {
        edit: vi.fn().mockResolvedValue({}),
      };

      const mockInteraction: any = {
        customId: 'giveaway:enter:gw-test-1',
        user: { id: 'user-entrant-1', createdTimestamp: Date.now() - 30 * 86_400_000 },
        member: {
          roles: { cache: new Map() },
          joinedTimestamp: Date.now() - 10 * 86_400_000,
          premiumSince: null,
        },
        message: mockMsg,
        reply: vi.fn(),
      };

      await handleGiveawayButtonInteraction(mockInteraction, mockServices as BotServices);

      expect(mockServices.giveawayRepo!.hasUserEntered).toHaveBeenCalledWith(
        'gw-test-1',
        'user-entrant-1',
      );
      expect(mockServices.giveawayRepo!.addEntry).toHaveBeenCalledWith(
        'gw-test-1',
        'user-entrant-1',
        1,
      );
      expect(mockMsg.edit).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('successfully entered'),
          ephemeral: true,
        }),
      );
    });

    it('prevents duplicate entry if user has already entered', async () => {
      vi.mocked(mockServices.giveawayRepo!.hasUserEntered).mockResolvedValue(true);

      const mockInteraction: any = {
        customId: 'giveaway:enter:gw-test-1',
        user: { id: 'user-already-entered', createdTimestamp: Date.now() },
        reply: vi.fn(),
      };

      await handleGiveawayButtonInteraction(mockInteraction, mockServices as BotServices);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('already entered'),
          ephemeral: true,
        }),
      );
    });

    it('rejects user if requirement check fails', async () => {
      vi.mocked(mockServices.giveawayRepo!.hasUserEntered).mockResolvedValue(false);
      vi.mocked(mockServices.giveawayEngine!.validateEntry).mockReturnValue({
        allowed: false,
        reason: 'Discord account is too new',
      });

      const mockInteraction: any = {
        customId: 'giveaway:enter:gw-test-1',
        user: { id: 'user-too-new', createdTimestamp: Date.now() },
        member: { roles: { cache: new Map() } },
        reply: vi.fn(),
      };

      await handleGiveawayButtonInteraction(mockInteraction, mockServices as BotServices);

      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('too new'),
          ephemeral: true,
        }),
      );
    });
  });
});
