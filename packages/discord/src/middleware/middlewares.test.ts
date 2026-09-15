import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { createPermissionMiddleware, resolvePermissionNames } from './permissions.js';
import { createMaintenanceMiddleware } from './maintenance.js';
import { createModuleToggleMiddleware } from './modules.js';
import { createCooldownMiddleware } from './cooldown.js';
import { createRateLimitMiddleware } from './ratelimit.js';
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
    });
  });
});
