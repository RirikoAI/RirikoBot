import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { registerReactionListener } from '../reaction.listener.js';
import { registerMemberListener } from '../member.listener.js';
import type { BotServices } from '../../services.js';

describe('Gateway Role Listeners Suite (TASK-1405)', () => {
  let mockClient: EventEmitter;
  let mockServices: Partial<BotServices>;
  let mockGuild: any;
  let mockMember: any;

  beforeEach(() => {
    mockClient = new EventEmitter();

    mockMember = {
      id: 'user-1',
      user: {
        id: 'user-1',
        bot: false,
        username: 'testuser',
        createdTimestamp: Date.now() - 100000,
      },
      joinedTimestamp: Date.now(),
      guild: null as any,
    };

    mockGuild = {
      id: 'guild-1',
      name: 'Test Guild',
      members: {
        cache: new Map([['user-1', mockMember]]),
        fetch: vi.fn().mockResolvedValue(mockMember),
      },
      channels: {
        cache: new Map(),
        fetch: vi.fn().mockResolvedValue(null),
      },
    };
    mockMember.guild = mockGuild;

    mockServices = {
      reactionRoleRepo: {
        findByMessageAndEmoji: vi.fn().mockImplementation((messageId, emoji) => {
          if (messageId === 'msg-1' && (emoji === '🎮' || emoji === '123456789')) {
            return Promise.resolve({
              id: 'rr-1',
              guildId: 'guild-1',
              channelId: 'ch-1',
              messageId: 'msg-1',
              emojiOrComponentId: emoji,
              roleId: 'role-1',
              type: 'EMOJI',
              mode: 'TOGGLE',
            });
          }
          return Promise.resolve(null);
        }),
      } as any,
      reactionRoleService: {
        handleReactionAdd: vi.fn().mockResolvedValue({ success: true }),
        handleReactionRemove: vi.fn().mockResolvedValue({ success: true }),
      } as any,
      autoRoleService: {
        handleMemberJoin: vi.fn().mockResolvedValue({ success: true, assignedRoles: ['role-1'] }),
        handleVerification: vi.fn().mockResolvedValue({ success: true, message: 'Verified!' }),
      } as any,
      antiRaidService: {
        handleMemberJoin: vi.fn().mockResolvedValue({ isRaid: false }),
        generateAlertEmbed: vi.fn(),
      } as any,
      guildSettingsRepo: {
        findById: vi.fn().mockResolvedValue(null),
      } as any,
    };
  });

  describe('registerReactionListener', () => {
    it('handles messageReactionAdd with unicode emoji', async () => {
      registerReactionListener(mockClient as any, mockServices as BotServices);

      const mockReaction = {
        partial: false,
        message: {
          id: 'msg-1',
          guild: mockGuild,
          partial: false,
        },
        emoji: {
          name: '🎮',
          id: null,
        },
      };

      const mockUser = {
        id: 'user-1',
        bot: false,
        partial: false,
      };

      mockClient.emit('messageReactionAdd', mockReaction, mockUser);
      await new Promise((r) => setTimeout(r, 20));

      expect(mockServices.reactionRoleRepo?.findByMessageAndEmoji).toHaveBeenCalledWith(
        'msg-1',
        '🎮',
      );
      expect(mockServices.reactionRoleService?.handleReactionAdd).toHaveBeenCalledWith(
        mockGuild,
        'msg-1',
        '🎮',
        mockMember,
      );
    });

    it('handles messageReactionAdd with custom emoji', async () => {
      registerReactionListener(mockClient as any, mockServices as BotServices);

      const mockReaction = {
        partial: false,
        message: {
          id: 'msg-1',
          guild: mockGuild,
          partial: false,
        },
        emoji: {
          name: 'custom_emoji',
          id: '123456789',
        },
      };

      const mockUser = {
        id: 'user-1',
        bot: false,
        partial: false,
      };

      mockClient.emit('messageReactionAdd', mockReaction, mockUser);
      await new Promise((r) => setTimeout(r, 20));

      expect(mockServices.reactionRoleService?.handleReactionAdd).toHaveBeenCalledWith(
        mockGuild,
        'msg-1',
        '123456789',
        mockMember,
      );
    });

    it('ignores bot reactions', async () => {
      registerReactionListener(mockClient as any, mockServices as BotServices);

      const mockReaction = {
        partial: false,
        message: { id: 'msg-1', guild: mockGuild, partial: false },
        emoji: { name: '🎮', id: null },
      };
      const botUser = { id: 'bot-1', bot: true, partial: false };

      mockClient.emit('messageReactionAdd', mockReaction, botUser);
      await new Promise((r) => setTimeout(r, 20));

      expect(mockServices.reactionRoleService?.handleReactionAdd).not.toHaveBeenCalled();
    });

    it('handles messageReactionRemove properly', async () => {
      registerReactionListener(mockClient as any, mockServices as BotServices);

      const mockReaction = {
        partial: false,
        message: {
          id: 'msg-1',
          guild: mockGuild,
          partial: false,
        },
        emoji: {
          name: '🎮',
          id: null,
        },
      };

      const mockUser = {
        id: 'user-1',
        bot: false,
        partial: false,
      };

      mockClient.emit('messageReactionRemove', mockReaction, mockUser);
      await new Promise((r) => setTimeout(r, 20));

      expect(mockServices.reactionRoleService?.handleReactionRemove).toHaveBeenCalledWith(
        mockGuild,
        'msg-1',
        '🎮',
        mockMember,
      );
    });
  });

  describe('registerMemberListener - AutoRole', () => {
    it('delegates member join event to AutoRoleService', async () => {
      registerMemberListener(mockClient as any, mockServices as BotServices);

      mockClient.emit('guildMemberAdd', mockMember);
      await new Promise((r) => setTimeout(r, 20));

      expect(mockServices.autoRoleService?.handleMemberJoin).toHaveBeenCalledWith(mockMember);
    });
  });
});
