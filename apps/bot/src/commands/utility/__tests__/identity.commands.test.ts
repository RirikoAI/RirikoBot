import { describe, it, expect, vi } from 'vitest';
import { ChannelType, PermissionsBitField } from 'discord.js';
import { CommandGuildOnlyError, type CommandContext } from '@ririko/discord';
import type { BotServices } from '../../../services.js';
import { createAvatarCommand } from '../avatar.command.js';
import { createGuildInfoCommand } from '../guild-info.command.js';
import { createMemberInfoCommand } from '../member-info.command.js';

describe('Server Identity Commands Suite', () => {
  describe('/get-avatar command', () => {
    function setupAvatar(
      options: {
        source?: 'slash' | 'prefix';
        args?: string[];
        targetUser?: any;
        authorUser?: any;
        serverAvatar?: boolean;
        memberAvatar?: string | null;
        isAnimated?: boolean;
      } = {},
    ) {
      const authorUser = options.authorUser ?? {
        id: 'user-1',
        username: 'UserOne',
        displayName: 'User One',
        displayAvatarURL: vi.fn(
          ({ extension, size }) =>
            `https://cdn.discordapp.com/avatars/user-1/hash.${extension || 'webp'}?size=${size || 4096}`,
        ),
        avatar: options.isAnimated ? 'a_animatedhash' : 'static_hash',
      };

      const targetUser = options.targetUser ?? authorUser;

      const member = {
        displayName: 'Guild Member Display',
        avatar: options.memberAvatar ?? null,
        displayAvatarURL: vi.fn(
          ({ extension, size }) =>
            `https://cdn.discordapp.com/guilds/guild-1/users/user-1/avatars/memberhash.${extension || 'webp'}?size=${size || 4096}`,
        ),
      };

      const guild = {
        id: 'guild-1',
        members: {
          fetch: vi.fn(async (_id: string) => member),
        },
      };

      const client = {
        users: {
          fetch: vi.fn(async (id: string) => ({
            id,
            username: `FetchedUser_${id}`,
            displayName: `Fetched User ${id}`,
            displayAvatarURL: vi.fn(
              ({ extension }) =>
                `https://cdn.discordapp.com/avatars/${id}/hash.${extension || 'webp'}`,
            ),
            avatar: 'fetchedhash',
          })),
        },
      };

      const raw = {
        source: options.source ?? 'slash',
        commandName: 'get-avatar',
        user: authorUser,
        guild,
        client,
        options: {
          getUser: vi.fn(async () => (options.targetUser ? options.targetUser : null)),
          getBoolean: vi.fn(() => options.serverAvatar ?? false),
          getRawArgs: vi.fn(() => options.args ?? []),
        },
        raw: {
          mentions: {
            users: new Map(options.targetUser ? [[options.targetUser.id, options.targetUser]] : []),
          },
        },
        reply: vi.fn<(payload: any) => Promise<void>>(async () => undefined),
      };

      const services = {} as BotServices;

      return {
        command: createAvatarCommand(services),
        ctx: raw as unknown as CommandContext,
        raw,
        authorUser,
        targetUser,
      };
    }

    it('defaults to author avatar when no options provided', async () => {
      const { command, ctx, raw, authorUser } = setupAvatar();
      await command.execute(ctx);

      expect(raw.reply).toHaveBeenCalled();
      const replyCall = raw.reply.mock.calls[0]![0];
      expect(replyCall.embeds[0].data.title).toContain(authorUser.displayName);
      expect(replyCall.embeds[0].data.description).toContain('[PNG]');
      expect(replyCall.embeds[0].data.description).toContain('[JPG]');
      expect(replyCall.embeds[0].data.description).toContain('[WebP]');
    });

    it('displays target user avatar when passed via slash option', async () => {
      const targetUser = {
        id: 'user-2',
        username: 'UserTwo',
        displayName: 'User Two',
        displayAvatarURL: vi.fn(
          ({ extension }) =>
            `https://cdn.discordapp.com/avatars/user-2/hash2.${extension || 'webp'}`,
        ),
        avatar: 'hash2',
      };
      const { command, ctx, raw } = setupAvatar({ targetUser });
      await command.execute(ctx);

      const replyCall = raw.reply.mock.calls[0]![0];
      expect(replyCall.embeds[0].data.title).toContain('User Two');
      expect(replyCall.embeds[0].data.footer.text).toContain('user-2');
    });

    it('displays GIF download format for animated avatars', async () => {
      const { command, ctx, raw } = setupAvatar({ isAnimated: true });
      await command.execute(ctx);

      const replyCall = raw.reply.mock.calls[0]![0];
      expect(replyCall.embeds[0].data.description).toContain('[GIF]');
    });

    it('fetches target user by user ID in prefix mode', async () => {
      const { command, ctx, raw } = setupAvatar({
        source: 'prefix',
        args: ['123456789012345678'],
      });
      await command.execute(ctx);

      expect(raw.client.users.fetch).toHaveBeenCalledWith('123456789012345678');
      const replyCall = raw.reply.mock.calls[0]![0];
      expect(replyCall.embeds[0].data.title).toContain('Fetched User 123456789012345678');
    });

    it('renders server-specific avatar when requested and available', async () => {
      const { command, ctx, raw } = setupAvatar({
        serverAvatar: true,
        memberAvatar: 'a_guildavatarhash',
      });
      await command.execute(ctx);

      const replyCall = raw.reply.mock.calls[0]![0];
      expect(replyCall.embeds[0].data.title).toContain('(Server Avatar)');
    });
  });

  describe('/guild-info command', () => {
    function setupGuildInfo(inGuild = true) {
      const channels = new Map<string, any>([
        ['c1', { type: ChannelType.GuildText }],
        ['c2', { type: ChannelType.GuildVoice }],
        ['c3', { type: ChannelType.GuildCategory }],
      ]);

      const members = new Map<string, any>([
        ['m1', { user: { bot: false } }],
        ['m2', { user: { bot: true } }],
      ]);

      const roles = new Map<string, any>([
        ['guild-1', { id: 'guild-1', name: '@everyone' }],
        ['r1', { id: 'r1', name: 'Admin' }],
        ['r2', { id: 'r2', name: 'Member' }],
      ]);

      const guild = inGuild
        ? {
            id: 'guild-1',
            name: 'Ririko Paradise',
            description: 'The premier Discord sanctuary',
            createdTimestamp: 1700000000000,
            ownerId: 'owner-1',
            memberCount: 250,
            premiumTier: 2,
            premiumSubscriptionCount: 7,
            verificationLevel: 2,
            channels: { cache: channels },
            members: { cache: members },
            roles: { cache: roles },
            emojis: { cache: new Map([['e1', {}]]) },
            stickers: { cache: new Map() },
            iconURL: vi.fn(() => 'https://cdn.discordapp.com/icons/guild-1/icon.png'),
            bannerURL: vi.fn(() => 'https://cdn.discordapp.com/banners/guild-1/banner.png'),
            fetchOwner: vi.fn(async () => ({
              id: 'owner-1',
              user: { id: 'owner-1', tag: 'GuildMaster#0001' },
            })),
          }
        : null;

      const services = {
        guildSettingsService: {
          getTimezone: vi.fn(async () => 'Asia/Kuala_Lumpur'),
          getPrefix: vi.fn(async () => '!'),
        },
      } as unknown as BotServices;

      const raw = {
        source: 'slash',
        commandName: 'guild-info',
        user: { id: 'user-1' },
        guild,
        options: {
          getString: vi.fn(() => null),
          getRawArgs: vi.fn(() => []),
        },
        reply: vi.fn<(payload: any) => Promise<void>>(async () => undefined),
      };

      return {
        command: createGuildInfoCommand(services),
        ctx: raw as unknown as CommandContext,
        raw,
        services,
      };
    }

    it('rejects execution when used in DMs', async () => {
      const { command, ctx } = setupGuildInfo(false);
      await expect(command.execute(ctx)).rejects.toThrow(CommandGuildOnlyError);
    });

    it('renders server stats, channels breakdown, and server timezone local time', async () => {
      const { command, ctx, raw } = setupGuildInfo(true);
      await command.execute(ctx);

      expect(raw.reply).toHaveBeenCalled();
      const replyCall = raw.reply.mock.calls[0]![0];
      const embed = replyCall.embeds[0].data;

      expect(embed.title).toContain('Ririko Paradise');
      expect(
        embed.fields.some(
          (f: any) => f.name.includes('Owner') && f.value.includes('GuildMaster#0001'),
        ),
      ).toBe(true);
      expect(
        embed.fields.some(
          (f: any) => f.name.includes('Timezone') && f.value.includes('Asia/Kuala_Lumpur'),
        ),
      ).toBe(true);
      expect(
        embed.fields.some((f: any) => f.name.includes('Members') && f.value.includes('250')),
      ).toBe(true);
      expect(
        embed.fields.some(
          (f: any) => f.name.includes('Channels') && f.value.includes('Text: **1**'),
        ),
      ).toBe(true);
      expect(
        embed.fields.some((f: any) => f.name.includes('Boost') && f.value.includes('Level **2**')),
      ).toBe(true);
    });
  });

  describe('/member-info command', () => {
    function setupMemberInfo(
      options: {
        inGuild?: boolean;
        hasEconomy?: boolean;
      } = {},
    ) {
      const inGuild = options.inGuild ?? true;
      const targetUser = {
        id: 'target-user-1',
        tag: 'TargetUser#1234',
        username: 'TargetUser',
        displayName: 'Target User',
        bot: false,
        createdTimestamp: 1680000000000,
        displayAvatarURL: vi.fn(() => 'https://cdn.discordapp.com/avatars/target/hash.png'),
      };

      const permissions = new PermissionsBitField();
      permissions.add(PermissionsBitField.Flags.ManageGuild);
      permissions.add(PermissionsBitField.Flags.ModerateMembers);

      const member = {
        id: targetUser.id,
        displayName: 'Target Nickname',
        displayColor: 0x9b59b6,
        joinedTimestamp: 1690000000000,
        permissions,
        roles: {
          cache: new Map([
            ['guild-1', { id: 'guild-1', name: '@everyone', position: 0 }],
            ['r1', { id: 'r1', name: 'Moderator', position: 5 }],
            ['r2', { id: 'r2', name: 'VIP', position: 3 }],
          ]),
          highest: { name: 'Moderator' },
        },
        displayAvatarURL: vi.fn(
          () => 'https://cdn.discordapp.com/guilds/guild-1/users/target/avatar.png',
        ),
      };

      const guild = inGuild
        ? {
            id: 'guild-1',
            members: {
              fetch: vi.fn(async (_id: string) => member),
            },
          }
        : null;

      const services = {
        resolveUserTimeZone: vi.fn(async () => 'America/New_York'),
        economyRepo: {
          findById: vi.fn(async () =>
            options.hasEconomy ? { walletBalance: 15000, bankBalance: 50000 } : null,
          ),
        },
        xpRepo: {
          findById: vi.fn(async () => (options.hasEconomy ? { level: 25, karma: 120 } : null)),
        },
      } as unknown as BotServices;

      const raw = {
        source: 'slash',
        commandName: 'member-info',
        user: targetUser,
        guild,
        options: {
          getUser: vi.fn(async () => targetUser),
          getRawArgs: vi.fn(() => []),
        },
        reply: vi.fn<(payload: any) => Promise<void>>(async () => undefined),
      };

      return {
        command: createMemberInfoCommand(services),
        ctx: raw as unknown as CommandContext,
        raw,
        services,
      };
    }

    it('rejects execution when used in DMs', async () => {
      const { command, ctx } = setupMemberInfo({ inGuild: false });
      await expect(command.execute(ctx)).rejects.toThrow(CommandGuildOnlyError);
    });

    it('renders member identity, timestamps, effective timezone, roles, and permissions', async () => {
      const { command, ctx, raw, services } = setupMemberInfo({ hasEconomy: true });
      await command.execute(ctx);

      expect(services.resolveUserTimeZone).toHaveBeenCalledWith('target-user-1', 'guild-1');
      expect(raw.reply).toHaveBeenCalled();

      const replyCall = raw.reply.mock.calls[0]![0];
      const embed = replyCall.embeds[0].data;

      expect(embed.title).toContain('Target Nickname');
      expect(
        embed.fields.some(
          (f: any) => f.name.includes('Effective Timezone') && f.value.includes('America/New_York'),
        ),
      ).toBe(true);
      expect(
        embed.fields.some(
          (f: any) => f.name.includes('Key Permissions') && f.value.includes('Manage Server'),
        ),
      ).toBe(true);
      expect(
        embed.fields.some(
          (f: any) => f.name.includes('Economy') && f.value.includes('Level: **25**'),
        ),
      ).toBe(true);
    });
  });
});
