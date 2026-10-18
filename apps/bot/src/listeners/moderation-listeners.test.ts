import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { registerMessageListener } from './message.listener.js';
import { registerMemberListener } from './member.listener.js';
import type { BotServices } from '../services.js';

describe('Gateway Moderation Listeners', () => {
  let mockClient: EventEmitter;
  let mockServices: Partial<BotServices>;

  beforeEach(() => {
    mockClient = new EventEmitter();
    mockServices = {
      autoModService: {
        processMessage: vi.fn(),
      } as any,
      antiRaidService: {
        handleMemberJoin: vi.fn(),
        generateAlertEmbed: vi.fn().mockReturnValue({
          title: '🚨 Anti-Raid Alert: Raid Activity Detected',
          description: 'Mass join detected',
          color: 0xed4245,
          fields: [],
          timestamp: new Date().toISOString(),
        }),
      } as any,
      antiSpamEvaluator: {
        evaluateMessage: vi.fn().mockReturnValue({ isAllowed: true }),
      } as any,
      economyService: {
        handleEvent: vi.fn().mockResolvedValue({ awarded: true, credits: 20, xp: 20 }),
      } as any,
      levelingService: {
        addExperience: vi.fn().mockResolvedValue({ didLevelUp: false, shouldNotify: false }),
      } as any,
      userRepo: {
        getOrCreate: vi.fn().mockResolvedValue({ id: 'user-1' }),
      } as any,
      guildSettingsRepo: {
        findById: vi.fn().mockResolvedValue({
          guildId: 'guild-1',
          logChannelId: 'mod-log-channel-1',
        }),
      } as any,
      guildSettingsService: {
        getSettings: vi.fn().mockResolvedValue(xpRules()),
      } as any,
    };
  });

  function xpRules(overrides: Record<string, unknown> = {}) {
    return {
      levelUpAnnouncements: true,
      levelUpChannelId: null,
      xpRatePercent: 100,
      noXpChannelIds: [],
      noXpRoleIds: [],
      voiceXpEnabled: false,
      ...overrides,
    };
  }

  function chatMessage(overrides: Record<string, unknown> = {}) {
    return {
      id: 'msg-1',
      channelId: 'chan-1',
      channel: {
        isThread: () => false,
        isSendable: () => true,
        send: vi.fn().mockResolvedValue({}),
      },
      content: 'Hello friends!',
      createdTimestamp: Date.now(),
      author: { id: 'user-1', bot: false, username: 'tester', displayName: 'Tester' },
      guild: { id: 'guild-1', ownerId: 'owner-1' },
      member: {
        roles: { cache: new Map() },
        permissions: { toArray: () => ['SendMessages'] },
      },
      mentions: { users: new Map(), roles: new Map(), everyone: false },
      delete: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  describe('registerMessageListener - XP rules (TASK-1151)', () => {
    beforeEach(() => {
      (mockServices.autoModService!.processMessage as any).mockResolvedValue({ matched: false });
    });

    async function send(message: ReturnType<typeof chatMessage>, client: any = mockClient) {
      registerMessageListener(client, mockServices as BotServices);
      client.emit('messageCreate', message);
      await new Promise((r) => setTimeout(r, 20));
    }

    it('gives no XP in a no-XP channel, its threads, or to members with a no-XP role', async () => {
      (mockServices.guildSettingsService!.getSettings as any).mockResolvedValue(
        xpRules({ noXpChannelIds: ['chan-1'], noXpRoleIds: ['muted'] }),
      );
      await send(chatMessage());
      await send(
        chatMessage({
          channelId: 'thread-1',
          channel: { isThread: () => true, parentId: 'chan-1', isSendable: () => true },
        }),
        new EventEmitter(),
      );
      await send(
        chatMessage({
          channelId: 'chan-2',
          member: {
            roles: { cache: new Map([['muted', {}]]) },
            permissions: { toArray: () => [] },
          },
        }),
        new EventEmitter(),
      );
      expect(mockServices.levelingService!.addExperience).not.toHaveBeenCalled();
    });

    it('scales XP by the guild rate', async () => {
      (mockServices.guildSettingsService!.getSettings as any).mockResolvedValue(
        xpRules({ xpRatePercent: 200 }),
      );
      await send(chatMessage());
      const xp = (mockServices.levelingService!.addExperience as any).mock.calls[0][2];
      expect(xp).toBeGreaterThanOrEqual(30);
      expect(xp).toBeLessThanOrEqual(50);
    });

    it('posts level-ups in the level-up channel, or here when Ririko cannot post there', async () => {
      (mockServices.levelingService!.addExperience as any).mockResolvedValue({
        didLevelUp: true,
        shouldNotify: true,
        newLevel: 4,
      });
      (mockServices.guildSettingsService!.getSettings as any).mockResolvedValue(
        xpRules({ levelUpChannelId: 'levels' }),
      );
      const levelChannel = { isSendable: () => true, send: vi.fn().mockResolvedValue({}) };
      const client = Object.assign(new EventEmitter(), {
        channels: { fetch: vi.fn().mockResolvedValue(levelChannel) },
      });
      const message = chatMessage();
      await send(message, client);
      expect(levelChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Level 4') }),
      );
      expect(message.channel.send).not.toHaveBeenCalled();

      client.channels.fetch.mockResolvedValue(null);
      const fallback = chatMessage();
      await send(fallback, client);
      expect(fallback.channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ allowedMentions: { users: ['user-1'] } }),
      );
    });
  });

  describe('registerMessageListener - AutoMod Wiring', () => {
    it('ignores bot messages without calling AutoMod', async () => {
      registerMessageListener(mockClient as any, mockServices as BotServices);

      const mockMessage = {
        author: { id: 'bot-1', bot: true },
        guild: { id: 'guild-1' },
      };

      mockClient.emit('messageCreate', mockMessage);

      // Wait a microtask tick for async handlers
      await new Promise((r) => setTimeout(r, 10));

      expect(mockServices.autoModService!.processMessage).not.toHaveBeenCalled();
      expect(mockServices.economyService!.handleEvent).not.toHaveBeenCalled();
    });

    it('ignores direct messages (no guild)', async () => {
      registerMessageListener(mockClient as any, mockServices as BotServices);

      const mockMessage = {
        author: { id: 'user-1', bot: false },
        guild: null,
      };

      mockClient.emit('messageCreate', mockMessage);

      await new Promise((r) => setTimeout(r, 10));

      expect(mockServices.autoModService!.processMessage).not.toHaveBeenCalled();
    });

    it('processes clean message through AutoMod and allows economy & leveling', async () => {
      (mockServices.autoModService!.processMessage as any).mockResolvedValue({
        matched: false,
        deleted: false,
        punished: false,
      });

      registerMessageListener(mockClient as any, mockServices as BotServices);

      const mockMessage = {
        id: 'msg-1',
        channelId: 'chan-1',
        channel: { isThread: () => false, isSendable: () => true },
        content: 'Hello friends!',
        createdTimestamp: Date.now(),
        author: { id: 'user-1', bot: false, username: 'tester', displayName: 'Tester' },
        guild: { id: 'guild-1', ownerId: 'owner-1' },
        member: {
          roles: { cache: new Map() },
          permissions: { toArray: () => ['SendMessages'] },
        },
        mentions: {
          users: new Map(),
          roles: new Map(),
          everyone: false,
        },
        delete: vi.fn().mockResolvedValue(undefined),
      };

      mockClient.emit('messageCreate', mockMessage);

      await new Promise((r) => setTimeout(r, 20));

      expect(mockServices.autoModService!.processMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-1',
          userId: 'user-1',
          content: 'Hello friends!',
        }),
      );
      expect(mockServices.economyService!.handleEvent).toHaveBeenCalled();
      expect(mockServices.levelingService!.addExperience).toHaveBeenCalled();
    });

    it('intercepts prohibited messages, halts execution and blocks rewards', async () => {
      (mockServices.autoModService!.processMessage as any).mockResolvedValue({
        matched: true,
        ruleType: 'PHISHING_SHIELD',
        actionTaken: 'DELETE',
        deleted: true,
        punished: false,
      });

      registerMessageListener(mockClient as any, mockServices as BotServices);

      const mockMessage = {
        id: 'msg-bad',
        channelId: 'chan-1',
        content: 'Free nitro at http://steamcomminuty.com/gift',
        createdTimestamp: Date.now(),
        author: { id: 'bad-user', bot: false, username: 'scammer' },
        guild: { id: 'guild-1', ownerId: 'owner-1' },
        member: {
          roles: { cache: new Map() },
          permissions: { toArray: () => [] },
        },
        mentions: {
          users: new Map(),
          roles: new Map(),
          everyone: false,
        },
        delete: vi.fn().mockResolvedValue(undefined),
      };

      mockClient.emit('messageCreate', mockMessage);

      await new Promise((r) => setTimeout(r, 20));

      expect(mockServices.autoModService!.processMessage).toHaveBeenCalled();
      // Economy & leveling should NEVER be called when AutoMod matches
      expect(mockServices.economyService!.handleEvent).not.toHaveBeenCalled();
      expect(mockServices.levelingService!.addExperience).not.toHaveBeenCalled();
    });
  });

  describe('registerMemberListener - Anti-Raid Wiring', () => {
    it('evaluates member join and does not alert on normal join', async () => {
      (mockServices.antiRaidService!.handleMemberJoin as any).mockResolvedValue({
        isRaid: false,
        guildId: 'guild-1',
        status: 'NORMAL',
        joinCount: 1,
        freshAccountCount: 0,
        accounts: [],
      });

      registerMemberListener(mockClient as any, mockServices as BotServices);

      const mockSend = vi.fn().mockResolvedValue(undefined);
      const mockMember = {
        id: 'user-join-1',
        joinedTimestamp: Date.now(),
        guild: {
          id: 'guild-1',
          name: 'Community Guild',
          channels: {
            cache: new Map([['mod-log-channel-1', { send: mockSend }]]),
            fetch: vi.fn(),
          },
        },
        user: {
          id: 'user-join-1',
          bot: false,
          username: 'normal_join',
          createdTimestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
        },
      };

      mockClient.emit('guildMemberAdd', mockMember);

      await new Promise((r) => setTimeout(r, 20));

      expect(mockServices.antiRaidService!.handleMemberJoin).toHaveBeenCalledWith({
        guildId: 'guild-1',
        userId: 'user-join-1',
        accountCreatedTimestamp: mockMember.user.createdTimestamp,
        joinedTimestamp: mockMember.joinedTimestamp,
        isBot: false,
        username: 'normal_join',
      });
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('dispatches alert embed to logChannel when a raid is detected', async () => {
      const raidResult = {
        isRaid: true,
        guildId: 'guild-1',
        status: 'LOCKDOWN' as const,
        joinCount: 12,
        freshAccountCount: 6,
        actionTaken: 'LOCKDOWN' as const,
        reason: 'Mass join velocity threshold exceeded (12 joins in 10s)',
        accounts: [],
      };

      (mockServices.antiRaidService!.handleMemberJoin as any).mockResolvedValue(raidResult);

      registerMemberListener(mockClient as any, mockServices as BotServices);

      const mockSend = vi.fn().mockResolvedValue(undefined);
      const mockChannel = { send: mockSend };

      const mockMember = {
        id: 'raid-user-12',
        joinedTimestamp: Date.now(),
        guild: {
          id: 'guild-1',
          name: 'Target Guild',
          channels: {
            cache: new Map([['mod-log-channel-1', mockChannel]]),
            fetch: vi.fn(),
          },
        },
        user: {
          id: 'raid-user-12',
          bot: false,
          username: 'raider_12',
          createdTimestamp: Date.now() - 1000 * 60, // 1 minute old
        },
      };

      mockClient.emit('guildMemberAdd', mockMember);

      await new Promise((r) => setTimeout(r, 20));

      expect(mockServices.antiRaidService!.handleMemberJoin).toHaveBeenCalled();
      expect(mockServices.antiRaidService!.generateAlertEmbed).toHaveBeenCalledWith(raidResult);
      expect(mockSend).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({ title: '🚨 Anti-Raid Alert: Raid Activity Detected' })],
      });
    });
  });
});
