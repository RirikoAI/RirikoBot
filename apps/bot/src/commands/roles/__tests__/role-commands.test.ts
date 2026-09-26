import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import {
  createCreateReactionRoleCommand,
  createReactionRolesCommand,
  createAutoRoleCommand,
  createTempRoleCommand,
  parseRoleDuration,
} from '../index.js';
import type { BotServices } from '../../../services.js';
import type { CommandContext } from '@ririko/discord';

describe('Role Commands Suite (TASK-1404)', () => {
  let mockServices: Partial<BotServices>;
  let mockGuild: any;
  let mockMember: any;
  let mockChannel: any;

  beforeEach(() => {
    mockMember = {
      id: 'user-admin',
      permissions: {
        has: vi.fn().mockImplementation((perm) => perm === PermissionFlagsBits.Administrator),
      },
    };

    mockChannel = {
      id: 'channel-1',
      isTextBased: () => true,
      send: vi.fn().mockResolvedValue({ id: 'msg-send-1' }),
      messages: {
        fetch: vi.fn().mockResolvedValue({
          id: 'msg-123',
          channelId: 'channel-1',
          url: 'https://discord.com/channels/guild-1/channel-1/msg-123',
          components: [],
          reactions: {
            cache: new Map(),
          },
          react: vi.fn().mockResolvedValue(true),
          edit: vi.fn().mockResolvedValue(true),
        }),
      },
    };

    const role1 = { id: 'role-1', name: 'Member', position: 10 };
    const roleBot = { id: 'role-bot', name: 'Bots', position: 10 };
    const roleVerify = { id: 'role-verify', name: 'Verified', position: 10 };

    mockGuild = {
      id: 'guild-1',
      name: 'Test Guild',
      roles: {
        cache: new Map([
          ['role-1', role1],
          ['role-bot', roleBot],
          ['role-verify', roleVerify],
        ]),
      },
      channels: {
        cache: new Map([['channel-1', mockChannel]]),
        fetch: vi.fn().mockResolvedValue(mockChannel),
      },
      members: {
        me: { id: 'bot-id' },
        fetch: vi.fn().mockImplementation((id: string) => {
          if (id === 'user-1' || id === 'user-admin') {
            return Promise.resolve({
              id,
              guild: mockGuild,
              roles: {
                cache: new Map(),
                add: vi.fn().mockResolvedValue(true),
                remove: vi.fn().mockResolvedValue(true),
              },
            });
          }
          return Promise.reject(new Error('User not found'));
        }),
      },
    };

    mockServices = {
      reactionRoleRepo: {
        create: vi.fn().mockResolvedValue({
          id: 'rr-1',
          guildId: 'guild-1',
          channelId: 'channel-1',
          messageId: 'msg-123',
          emojiOrComponentId: '🎮',
          roleId: 'role-1',
          type: 'EMOJI',
          mode: 'TOGGLE',
          groupId: null,
          label: '🎮',
        }),
        findById: vi.fn().mockImplementation((id: string) => {
          if (id === 'rr-1') {
            return Promise.resolve({
              id: 'rr-1',
              guildId: 'guild-1',
              channelId: 'channel-1',
              messageId: 'msg-123',
              emojiOrComponentId: '🎮',
              roleId: 'role-1',
              type: 'EMOJI',
              mode: 'TOGGLE',
              groupId: null,
              label: '🎮',
            });
          }
          return Promise.resolve(null);
        }),
        findByGuildId: vi.fn().mockResolvedValue([
          {
            id: 'rr-1',
            guildId: 'guild-1',
            channelId: 'channel-1',
            messageId: 'msg-123',
            emojiOrComponentId: '🎮',
            roleId: 'role-1',
            type: 'EMOJI',
            mode: 'TOGGLE',
            groupId: null,
            label: '🎮',
          },
        ]),
        delete: vi.fn().mockResolvedValue(true),
      } as any,
      autoRoleRepo: {
        getGuildAutoRoles: vi.fn().mockResolvedValue({
          guildId: 'guild-1',
          isEnabled: true,
          humanRoleIds: ['role-1'],
          botRoleIds: ['role-bot'],
          verificationRoleId: 'role-verify',
        }),
        upsertGuildAutoRoles: vi.fn().mockResolvedValue({
          guildId: 'guild-1',
          isEnabled: true,
          humanRoleIds: ['role-1'],
          botRoleIds: ['role-bot'],
          verificationRoleId: 'role-verify',
        }),
        setHumanRoleIds: vi.fn().mockResolvedValue({
          guildId: 'guild-1',
          isEnabled: true,
          humanRoleIds: ['role-1'],
        }),
        setBotRoleIds: vi.fn().mockResolvedValue({
          guildId: 'guild-1',
          isEnabled: true,
          botRoleIds: ['role-bot'],
        }),
        setVerificationRole: vi.fn().mockResolvedValue({
          guildId: 'guild-1',
          isEnabled: true,
          verificationRoleId: 'role-verify',
        }),
        listTemporaryRoles: vi.fn().mockResolvedValue([
          {
            id: 'temp-1',
            guildId: 'guild-1',
            userId: 'user-1',
            roleId: 'role-1',
            expiresAt: new Date(Date.now() + 3600000),
          },
        ]),
      } as any,
      reactionRoleService: {
        hasPermission: vi.fn().mockReturnValue(true),
        isValidRole: vi.fn().mockReturnValue(true),
      } as any,
      autoRoleService: {
        hasManageRolesPermission: vi.fn().mockReturnValue(true),
        isValidAssignableRole: vi
          .fn()
          .mockReturnValue({ valid: true, role: { id: 'role-1', name: 'Member' } }),
        assignTemporaryRole: vi.fn().mockResolvedValue({ success: true, roleId: 'role-1' }),
        removeTemporaryRole: vi.fn().mockResolvedValue(true),
      } as any,
    };
  });

  function createMockContext(overrides: Partial<CommandContext> = {}): CommandContext {
    return {
      guildId: 'guild-1',
      guild: mockGuild,
      user: { id: 'user-admin' },
      member: mockMember,
      channel: mockChannel,
      source: 'slash',
      raw: {
        options: {
          getRole: vi.fn().mockReturnValue(null),
        },
      },
      options: {
        getString: vi.fn().mockReturnValue(null),
        getInteger: vi.fn().mockReturnValue(null),
        getBoolean: vi.fn().mockReturnValue(null),
        getUser: vi.fn().mockReturnValue(null),
        getMember: vi.fn().mockReturnValue(null),
        getChannel: vi.fn().mockReturnValue(null),
        getSubcommand: vi.fn().mockReturnValue(null),
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getRawArgs: vi.fn().mockReturnValue([]),
      } as any,
      reply: vi.fn().mockResolvedValue(undefined),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as CommandContext;
  }

  describe('Duration Parser Utility', () => {
    it('parses valid durations correctly', () => {
      expect(parseRoleDuration('30s')).toBe(30 * 1000);
      expect(parseRoleDuration('15m')).toBe(15 * 60 * 1000);
      expect(parseRoleDuration('2h')).toBe(2 * 60 * 60 * 1000);
      expect(parseRoleDuration('3d')).toBe(3 * 24 * 60 * 60 * 1000);
      expect(parseRoleDuration('1w')).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('returns null for invalid durations', () => {
      expect(parseRoleDuration('')).toBeNull();
      expect(parseRoleDuration('invalid')).toBeNull();
      expect(parseRoleDuration('10x')).toBeNull();
    });
  });

  describe('create-reaction-role command', () => {
    it('creates an emoji reaction role successfully', async () => {
      const cmd = createCreateReactionRoleCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'message-id') return 'msg-123';
            if (name === 'emoji') return '🎮';
            if (name === 'type') return 'emoji';
            if (name === 'mode') return 'toggle';
            if (name === 'role') return 'role-1';
            return null;
          }),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockServices.reactionRoleRepo?.create).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-1',
          messageId: 'msg-123',
          emojiOrComponentId: '🎮',
          roleId: 'role-1',
          type: 'EMOJI',
          mode: 'TOGGLE',
        }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('creates a button reaction role successfully', async () => {
      const cmd = createCreateReactionRoleCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'message-id') return 'msg-123';
            if (name === 'emoji') return '🎮';
            if (name === 'type') return 'button';
            if (name === 'mode') return 'toggle';
            if (name === 'role') return 'role-1';
            return null;
          }),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockServices.reactionRoleRepo?.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'BUTTON',
        }),
      );
      expect(ctx.reply).toHaveBeenCalled();
    });

    it('rejects if user lacks admin permission', async () => {
      const cmd = createCreateReactionRoleCommand(mockServices as BotServices);
      mockMember.permissions.has.mockReturnValue(false);
      const ctx = createMockContext();

      await cmd.execute(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Administrator or Manage Roles permission'),
        }),
      );
    });
  });

  describe('reaction-roles command', () => {
    it('lists reaction roles in the guild', async () => {
      const cmd = createReactionRolesCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => (name === 'action' ? 'list' : null)),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockServices.reactionRoleRepo?.findByGuildId).toHaveBeenCalledWith('guild-1');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('removes a reaction role by ID', async () => {
      const cmd = createReactionRolesCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'action') return 'remove';
            if (name === 'id') return 'rr-1';
            return null;
          }),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockServices.reactionRoleRepo?.delete).toHaveBeenCalledWith('rr-1');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Successfully removed reaction role'),
        }),
      );
    });

    it('takes the removed button off the message (TASK-1643)', async () => {
      const row = (ids: string[]) => ({
        toJSON: () => ({
          type: 1,
          components: ids.map((id) => ({
            type: 2,
            style: 1,
            label: id,
            custom_id: `rr:btn:${id}`,
          })),
        }),
      });
      const message = {
        editable: true,
        components: [row(['rr-2', 'rr-3'])],
        edit: vi.fn().mockResolvedValue(true),
      };
      mockChannel.messages.fetch = vi.fn().mockResolvedValue(message);
      vi.mocked(mockServices.reactionRoleRepo!.findById).mockResolvedValueOnce({
        id: 'rr-2',
        guildId: 'guild-1',
        channelId: 'channel-1',
        messageId: 'msg-123',
        emojiOrComponentId: 'rr:btn:rr-2',
        roleId: 'role-1',
        type: 'BUTTON',
        mode: 'TOGGLE',
        groupId: 'group-1',
        label: 'Member',
        description: null,
      });
      const cmd = createReactionRolesCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'action') return 'remove';
            if (name === 'id') return 'rr-2';
            return null;
          }),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(message.edit).toHaveBeenCalledWith({
        components: [
          {
            type: 1,
            components: [{ type: 2, style: 1, label: 'rr-3', custom_id: 'rr:btn:rr-3' }],
          },
        ],
      });
      expect(mockServices.reactionRoleRepo?.delete).toHaveBeenCalledWith('rr-2');
    });
  });

  describe('autorole command', () => {
    it('shows current autorole settings', async () => {
      const cmd = createAutoRoleCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => (name === 'action' ? 'show' : null)),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockServices.autoRoleRepo?.getGuildAutoRoles).toHaveBeenCalledWith('guild-1');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('configures human join role', async () => {
      const cmd = createAutoRoleCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'action') return 'humans';
            if (name === 'role') return 'role-1';
            return null;
          }),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockServices.autoRoleRepo?.setHumanRoleIds).toHaveBeenCalledWith('guild-1', [
        'role-1',
      ]);
      expect(ctx.reply).toHaveBeenCalled();
    });

    it('configures bot join role', async () => {
      const cmd = createAutoRoleCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'action') return 'bots';
            if (name === 'role') return 'role-bot';
            return null;
          }),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockServices.autoRoleRepo?.setBotRoleIds).toHaveBeenCalledWith('guild-1', [
        'role-bot',
      ]);
      expect(ctx.reply).toHaveBeenCalled();
    });

    it('configures verify role', async () => {
      const cmd = createAutoRoleCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'action') return 'verify';
            if (name === 'role') return 'role-verify';
            return null;
          }),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockServices.autoRoleRepo?.setVerificationRole).toHaveBeenCalledWith(
        'guild-1',
        'role-verify',
      );
      expect(ctx.reply).toHaveBeenCalled();
    });

    it('sends verification button prompt to channel', async () => {
      const cmd = createAutoRoleCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi
            .fn()
            .mockImplementation((name) => (name === 'action' ? 'send-verify' : null)),
          getChannel: vi.fn().mockResolvedValue(mockChannel),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        }),
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Verification prompt sent'),
        }),
      );
    });
  });

  describe('temprole command', () => {
    it('assigns a temporary role', async () => {
      const cmd = createTempRoleCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'action') return 'add';
            if (name === 'role') return 'role-1';
            if (name === 'duration') return '1d';
            return null;
          }),
          getUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockServices.autoRoleService?.assignTemporaryRole).toHaveBeenCalledWith(
        mockGuild,
        expect.objectContaining({ id: 'user-1' }),
        'role-1',
        24 * 60 * 60 * 1000,
        'user-admin',
      );
      expect(ctx.reply).toHaveBeenCalled();
    });

    it('removes a temporary role', async () => {
      const cmd = createTempRoleCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'action') return 'remove';
            if (name === 'role') return 'role-1';
            return null;
          }),
          getUser: vi.fn().mockResolvedValue({ id: 'user-1' }),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockServices.autoRoleService?.removeTemporaryRole).toHaveBeenCalledWith(
        mockGuild,
        expect.objectContaining({ id: 'user-1' }),
        'role-1',
      );
      expect(ctx.reply).toHaveBeenCalled();
    });

    it('lists active temporary roles', async () => {
      const cmd = createTempRoleCommand(mockServices as BotServices);
      const ctx = createMockContext({
        options: {
          getString: vi.fn().mockImplementation((name) => (name === 'action' ? 'list' : null)),
          getUser: vi.fn().mockResolvedValue(null),
          getRawArgs: vi.fn().mockReturnValue([]),
        } as any,
      });

      await cmd.execute(ctx);

      expect(mockServices.autoRoleRepo?.listTemporaryRoles).toHaveBeenCalledWith('guild-1');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });
  });
});
