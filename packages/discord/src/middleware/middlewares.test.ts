import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { createPermissionMiddleware, resolvePermissionNames } from './permissions.js';
import { createMaintenanceMiddleware } from './maintenance.js';
import { createModuleToggleMiddleware } from './modules.js';
import { createCooldownMiddleware } from './cooldown.js';
import { createRateLimitMiddleware, isRateLimitBypassed } from './ratelimit.js';
import { CommandCategory, type Command, type CommandContext } from '../command/types.js';
import {
  CommandGuildOnlyError,
  CommandPermissionError,
  CommandMaintenanceError,
  CommandDisabledError,
  CommandCooldownError,
  CommandRateLimitError,
} from '../errors/index.js';

describe('Built-in Middlewares (TASK-0322)', () => {
  describe('resolvePermissionNames helper', () => {
    it('correctly maps permission bigints to string names', () => {
      const names = resolvePermissionNames([
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.KickMembers,
      ]);
      expect(names).toContain('BanMembers');
      expect(names).toContain('KickMembers');
    });
  });

  describe('PermissionMiddleware', () => {
    const ownerId = 'dev-123';
    const mw = createPermissionMiddleware({ ownerIds: [ownerId] });
    const next = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      next.mockClear();
    });

    it('enforces isGuildOnly restriction', async () => {
      const cmd: Command = {
        metadata: {
          name: 'serverstats',
          category: CommandCategory.UTILITY,
          description: 'Server stats',
          isGuildOnly: true,
        },
        execute: vi.fn(),
      };

      const ctxWithoutGuild = {
        command: cmd,
        guild: null,
        user: { id: 'u1' },
      } as unknown as CommandContext;

      await expect(mw(ctxWithoutGuild, next)).rejects.toThrow(CommandGuildOnlyError);
      expect(next).not.toHaveBeenCalled();

      const ctxWithGuild = {
        command: cmd,
        guild: { id: 'g1' },
        user: { id: 'u1' },
      } as unknown as CommandContext;

      await mw(ctxWithGuild, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('enforces isOwnerOnly restriction', async () => {
      const cmd: Command = {
        metadata: {
          name: 'eval',
          category: CommandCategory.ADMIN,
          description: 'Evaluate code',
          isOwnerOnly: true,
        },
        execute: vi.fn(),
      };

      const nonOwnerCtx = {
        command: cmd,
        user: { id: 'random-user' },
      } as unknown as CommandContext;

      await expect(mw(nonOwnerCtx, next)).rejects.toThrow(CommandPermissionError);
      expect(next).not.toHaveBeenCalled();

      const ownerCtx = {
        command: cmd,
        user: { id: ownerId },
      } as unknown as CommandContext;

      await mw(ownerCtx, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('enforces userPermissions bitfield check', async () => {
      const cmd: Command = {
        metadata: {
          name: 'ban',
          category: CommandCategory.MODERATION,
          description: 'Ban user',
          userPermissions: [PermissionFlagsBits.BanMembers],
        },
        execute: vi.fn(),
      };

      const memberWithoutPerms = {
        permissions: {
          has: vi.fn().mockReturnValue(false),
        },
      };

      const ctxMissingPerms = {
        command: cmd,
        guild: { id: 'g1' },
        member: memberWithoutPerms,
        user: { id: 'u1' },
      } as unknown as CommandContext;

      await expect(mw(ctxMissingPerms, next)).rejects.toThrow(CommandPermissionError);
      expect(next).not.toHaveBeenCalled();

      const memberWithPerms = {
        permissions: {
          has: vi.fn().mockReturnValue(true),
        },
      };

      const ctxHasPerms = {
        command: cmd,
        guild: { id: 'g1' },
        member: memberWithPerms,
        user: { id: 'u1' },
      } as unknown as CommandContext;

      await mw(ctxHasPerms, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('enforces botPermissions bitfield check', async () => {
      const cmd: Command = {
        metadata: {
          name: 'clear',
          category: CommandCategory.MODERATION,
          description: 'Clear messages',
          botPermissions: [PermissionFlagsBits.ManageMessages],
        },
        execute: vi.fn(),
      };

      const botWithoutPerms = {
        permissions: {
          has: vi.fn().mockReturnValue(false),
        },
      };

      const ctxBotMissing = {
        command: cmd,
        guild: { id: 'g1', members: { me: botWithoutPerms } },
        member: null,
        user: { id: 'u1' },
      } as unknown as CommandContext;

      await expect(mw(ctxBotMissing, next)).rejects.toThrow(CommandPermissionError);
      expect(next).not.toHaveBeenCalled();

      const botWithPerms = {
        permissions: {
          has: vi.fn().mockReturnValue(true),
        },
      };

      const ctxBotHasPerms = {
        command: cmd,
        guild: { id: 'g1', members: { me: botWithPerms } },
        member: null,
        user: { id: 'u1' },
      } as unknown as CommandContext;

      await mw(ctxBotHasPerms, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('implicitly requires guild when userPermissions or botPermissions are specified', async () => {
      const userPermCmd: Command = {
        metadata: {
          name: 'warn',
          category: CommandCategory.MODERATION,
          description: 'Warn',
          userPermissions: [PermissionFlagsBits.ModerateMembers],
        },
        execute: vi.fn(),
      };

      const dmCtx = {
        command: userPermCmd,
        guild: null,
        user: { id: 'u1' },
      } as unknown as CommandContext;

      await expect(mw(dmCtx, next)).rejects.toThrow(CommandGuildOnlyError);
      expect(next).not.toHaveBeenCalled();

      const botPermCmd: Command = {
        metadata: {
          name: 'botaction',
          category: CommandCategory.UTILITY,
          description: 'Bot action',
          botPermissions: [PermissionFlagsBits.ManageChannels],
        },
        execute: vi.fn(),
      };

      const dmBotCtx = {
        command: botPermCmd,
        guild: null,
        user: { id: 'u1' },
      } as unknown as CommandContext;

      await expect(mw(dmBotCtx, next)).rejects.toThrow(CommandGuildOnlyError);
      expect(next).not.toHaveBeenCalled();
    });

    it('allows guild owner to bypass user permissions check', async () => {
      const cmd: Command = {
        metadata: {
          name: 'ban',
          category: CommandCategory.MODERATION,
          description: 'Ban user',
          userPermissions: [PermissionFlagsBits.BanMembers],
        },
        execute: vi.fn(),
      };

      // User without BanMembers, but is the guild owner
      const memberWithoutPerms = {
        permissions: {
          has: vi.fn().mockReturnValue(false),
        },
      };

      const ownerCtx = {
        command: cmd,
        guild: { id: 'g1', ownerId: 'server-owner-id' },
        member: memberWithoutPerms,
        user: { id: 'server-owner-id' },
      } as unknown as CommandContext;

      await mw(ownerCtx, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('resolves user permissions from raw slash interaction memberPermissions', async () => {
      const cmd: Command = {
        metadata: {
          name: 'kick',
          category: CommandCategory.MODERATION,
          description: 'Kick user',
          userPermissions: [PermissionFlagsBits.KickMembers],
        },
        execute: vi.fn(),
      };

      const interactionPermissions = {
        has: vi.fn((perm: bigint) => perm === PermissionFlagsBits.KickMembers),
      };

      const interactionCtx = {
        command: cmd,
        guild: { id: 'g1', ownerId: 'someone-else' },
        member: null,
        raw: { memberPermissions: interactionPermissions },
        user: { id: 'slash-user' },
      } as unknown as CommandContext;

      await mw(interactionCtx, next);
      expect(next).toHaveBeenCalledOnce();
      expect(interactionPermissions.has).toHaveBeenCalledWith(PermissionFlagsBits.KickMembers);
    });

    it('fetches member from guild when ctx.member is missing', async () => {
      const cmd: Command = {
        metadata: {
          name: 'mute',
          category: CommandCategory.MODERATION,
          description: 'Mute',
          userPermissions: [PermissionFlagsBits.ModerateMembers],
        },
        execute: vi.fn(),
      };

      const fetchedMember = {
        permissions: {
          has: vi.fn().mockReturnValue(true),
        },
      };

      const fetchFn = vi.fn().mockResolvedValue(fetchedMember);
      const ctx = {
        command: cmd,
        guild: {
          id: 'g1',
          ownerId: 'other',
          members: { fetch: fetchFn },
        },
        member: null,
        raw: {},
        user: { id: 'uncached-user' },
      } as unknown as CommandContext;

      await mw(ctx, next);
      expect(fetchFn).toHaveBeenCalledWith('uncached-user');
      expect(next).toHaveBeenCalledOnce();
    });

    it('fetches bot member via fetchMe() when ctx.guild.members.me is null', async () => {
      const cmd: Command = {
        metadata: {
          name: 'role',
          category: CommandCategory.MODERATION,
          description: 'Manage role',
          botPermissions: [PermissionFlagsBits.ManageRoles],
        },
        execute: vi.fn(),
      };

      const fetchedBot = {
        permissions: {
          has: vi.fn().mockReturnValue(true),
        },
      };

      const fetchMeFn = vi.fn().mockResolvedValue(fetchedBot);
      const ctx = {
        command: cmd,
        guild: {
          id: 'g1',
          members: { me: null, fetchMe: fetchMeFn },
        },
        member: null,
        user: { id: 'u1' },
      } as unknown as CommandContext;

      await mw(ctx, next);
      expect(fetchMeFn).toHaveBeenCalled();
      expect(next).toHaveBeenCalledOnce();
    });

    it('throws CommandPermissionError when permissions cannot be resolved in guild', async () => {
      const cmd: Command = {
        metadata: {
          name: 'ban',
          category: CommandCategory.MODERATION,
          description: 'Ban',
          userPermissions: [PermissionFlagsBits.BanMembers],
        },
        execute: vi.fn(),
      };

      const ctxUnresolvable = {
        command: cmd,
        guild: {
          id: 'g1',
          ownerId: 'other',
          members: { fetch: vi.fn().mockResolvedValue(null) },
        },
        member: null,
        raw: {},
        user: { id: 'ghost-user' },
      } as unknown as CommandContext;

      await expect(mw(ctxUnresolvable, next)).rejects.toThrow(CommandPermissionError);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('MaintenanceMiddleware', () => {
    const next = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      next.mockClear();
    });

    it('passes transparently when maintenance mode is inactive', async () => {
      const mw = createMaintenanceMiddleware({
        isMaintenanceEnabled: () => false,
      });

      const ctx = { user: { id: 'regular-user' } } as CommandContext;
      await mw(ctx, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('blocks regular users when maintenance mode is active', async () => {
      const mw = createMaintenanceMiddleware({
        isMaintenanceEnabled: () => true,
        ownerIds: ['dev-1'],
      });

      const ctx = { user: { id: 'regular-user' } } as CommandContext;
      await expect(mw(ctx, next)).rejects.toThrow(CommandMaintenanceError);
      expect(next).not.toHaveBeenCalled();
    });

    it('bypasses maintenance mode for bot developers', async () => {
      const mw = createMaintenanceMiddleware({
        isMaintenanceEnabled: () => true,
        ownerIds: ['dev-1'],
      });

      const ctx = { user: { id: 'dev-1' } } as CommandContext;
      await mw(ctx, next);

      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('ModuleToggleMiddleware', () => {
    const next = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      next.mockClear();
    });

    it('passes when module is enabled in guild', async () => {
      const isModuleEnabled = vi.fn().mockResolvedValue(true);
      const mw = createModuleToggleMiddleware({ isModuleEnabled });

      const ctx = {
        guildId: 'g1',
        command: {
          metadata: { name: 'play', category: CommandCategory.MUSIC, description: 'Play' },
          execute: vi.fn(),
        },
      } as unknown as CommandContext;

      await mw(ctx, next);
      expect(isModuleEnabled).toHaveBeenCalledWith('g1', CommandCategory.MUSIC);
      expect(next).toHaveBeenCalledOnce();
    });

    it('throws CommandDisabledError when module is disabled in guild', async () => {
      const isModuleEnabled = vi.fn().mockResolvedValue(false);
      const mw = createModuleToggleMiddleware({ isModuleEnabled });

      const ctx = {
        guildId: 'g1',
        command: {
          metadata: { name: 'card', category: CommandCategory.TCG, description: 'Card' },
          execute: vi.fn(),
        },
      } as unknown as CommandContext;

      await expect(mw(ctx, next)).rejects.toThrow(CommandDisabledError);
      expect(next).not.toHaveBeenCalled();
    });

    it('bypasses exempt categories', async () => {
      const isModuleEnabled = vi.fn().mockResolvedValue(false);
      const mw = createModuleToggleMiddleware({
        isModuleEnabled,
        exemptCategories: [CommandCategory.GENERAL],
      });

      const ctx = {
        guildId: 'g1',
        command: {
          metadata: { name: 'help', category: CommandCategory.GENERAL, description: 'Help' },
          execute: vi.fn(),
        },
      } as unknown as CommandContext;

      await mw(ctx, next);
      expect(isModuleEnabled).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('CooldownMiddleware', () => {
    const next = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      next.mockClear();
      vi.useRealTimers();
    });

    it('allows initial invocation and blocks subsequent invocation within cooldown window', async () => {
      vi.useFakeTimers();
      const mw = createCooldownMiddleware();

      const cmd: Command = {
        metadata: {
          name: 'daily',
          category: CommandCategory.ECONOMY,
          description: 'Daily reward',
          cooldownSeconds: 10,
        },
        execute: vi.fn(),
      };

      const ctx = {
        command: cmd,
        user: { id: 'u100' },
        channelId: 'ch1',
      } as unknown as CommandContext;

      // 1. First execution passes
      await mw(ctx, next);
      expect(next).toHaveBeenCalledOnce();

      // 2. Immediate second execution blocked
      await expect(mw(ctx, next)).rejects.toThrow(CommandCooldownError);

      // 3. Fast-forward time past cooldown
      vi.advanceTimersByTime(10_500);

      // 4. Third execution passes
      await mw(ctx, next);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('allows bypass evaluator to skip cooldown', async () => {
      vi.useFakeTimers();
      const mw = createCooldownMiddleware({
        bypass: (ctx) => ctx.user.id === 'vip-user',
      });

      const cmd: Command = {
        metadata: {
          name: 'coinflip',
          category: CommandCategory.GAMES,
          description: 'Coin flip',
          cooldownSeconds: 30,
        },
        execute: vi.fn(),
      };

      const ctx = {
        command: cmd,
        user: { id: 'vip-user' },
        channelId: 'ch1',
      } as unknown as CommandContext;

      await mw(ctx, next);
      await mw(ctx, next);

      expect(next).toHaveBeenCalledTimes(2);
    });
  });

  describe('RateLimitMiddleware', () => {
    const next = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      next.mockClear();
      vi.useRealTimers();
    });

    it('allows invocations up to max limit and throws CommandRateLimitError once exceeded', async () => {
      vi.useFakeTimers();
      const mw = createRateLimitMiddleware();

      const cmd: Command = {
        metadata: {
          name: 'search',
          category: CommandCategory.UTILITY,
          description: 'Search',
          rateLimit: { max: 2, windowSeconds: 5 },
        },
        execute: vi.fn(),
      };

      const ctx = {
        command: cmd,
        user: { id: 'u200' },
        channelId: 'ch1',
      } as unknown as CommandContext;

      // 1. First request
      await mw(ctx, next);
      expect(next).toHaveBeenCalledOnce();

      // 2. Second request
      await mw(ctx, next);
      expect(next).toHaveBeenCalledTimes(2);

      // 3. Third request exceeds limit (max: 2 in 5s)
      await expect(mw(ctx, next)).rejects.toThrow(CommandRateLimitError);

      // 4. Advance time past the 5-second window
      vi.advanceTimersByTime(5_100);

      // 5. Fourth request passes
      await mw(ctx, next);
      expect(next).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it('applies defaultLimit when command does not specify rateLimit metadata', async () => {
      let clock = 1000;
      const mw = createRateLimitMiddleware({
        defaultLimit: { max: 2, windowSeconds: 10 },
        now: () => clock,
      });

      const cmd: Command = {
        metadata: {
          name: 'ping',
          category: CommandCategory.GENERAL,
          description: 'Ping',
        },
        execute: vi.fn(),
      };

      const ctx = {
        command: cmd,
        user: { id: 'u300' },
        channelId: 'ch1',
      } as unknown as CommandContext;

      await mw(ctx, next);
      await mw(ctx, next);
      await expect(mw(ctx, next)).rejects.toThrow(CommandRateLimitError);

      clock += 11_000;
      await mw(ctx, next);
      expect(next).toHaveBeenCalledTimes(3);
    });

    it('bypasses rate limit when bypass predicate returns true', async () => {
      const clock = 1000;
      const mw = createRateLimitMiddleware({
        defaultLimit: { max: 1, windowSeconds: 60 },
        bypass: (ctx) => ctx.user.id === 'owner',
        now: () => clock,
      });

      const cmd: Command = {
        metadata: { name: 'help', category: CommandCategory.GENERAL, description: 'Help' },
        execute: vi.fn(),
      };

      const ownerCtx = {
        command: cmd,
        user: { id: 'owner' },
        channelId: 'ch1',
      } as unknown as CommandContext;

      await mw(ownerCtx, next);
      await mw(ownerCtx, next);
      await mw(ownerCtx, next);
      expect(next).toHaveBeenCalledTimes(3);
    });

    it('evaluates isRateLimitBypassed correctly for bot owners, guild owners, and admins', () => {
      const ownerCtx = {
        user: { id: 'owner1' },
      } as unknown as CommandContext;
      expect(isRateLimitBypassed(ownerCtx, ['owner1'])).toBe(true);
      expect(isRateLimitBypassed(ownerCtx, ['other'])).toBe(false);

      const guildOwnerCtx = {
        user: { id: 'u1' },
        guild: { ownerId: 'u1' },
      } as unknown as CommandContext;
      expect(isRateLimitBypassed(guildOwnerCtx)).toBe(true);

      const adminCtx = {
        user: { id: 'admin1' },
        guild: { ownerId: 'other' },
        member: {
          permissions: {
            has: (bit: bigint) => (bit & PermissionFlagsBits.Administrator) !== 0n,
          },
        },
      } as unknown as CommandContext;
      expect(isRateLimitBypassed(adminCtx)).toBe(true);

      const regularCtx = {
        user: { id: 'reg1' },
        guild: { ownerId: 'other' },
        member: {
          permissions: {
            has: () => false,
          },
        },
      } as unknown as CommandContext;
      expect(isRateLimitBypassed(regularCtx)).toBe(false);
    });
  });
});
