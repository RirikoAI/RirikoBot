import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiddlewarePipeline } from './pipeline.js';
import type { CommandContext, Command } from '../command/types.js';
import { CommandCategory } from '../command/types.js';
import {
  CommandCooldownError,
  CommandMaintenanceError,
  CommandPermissionError,
  CommandGuildOnlyError,
  CommandDisabledError,
  CommandRateLimitError,
} from '../errors/index.js';
import { CommandRouter } from '../router/router.js';
import { CommandRegistry } from '../router/registry.js';
import type { ChatInputCommandInteraction, Message } from 'discord.js';

describe('MiddlewarePipeline Engine (TASK-0321)', () => {
  let pipeline: MiddlewarePipeline;
  let mockCtx: CommandContext;

  beforeEach(() => {
    pipeline = new MiddlewarePipeline();
    mockCtx = {
      source: 'slash',
      id: 'ctx-1',
      commandName: 'test',
      invokedPrefix: '/',
      isReplied: false,
      isDeferred: false,
    } as unknown as CommandContext;
  });

  it('executes middlewares in order with onion-style next wrapping', async () => {
    const callOrder: string[] = [];

    pipeline.use(async (_ctx, next) => {
      callOrder.push('m1-before');
      await next();
      callOrder.push('m1-after');
    });

    pipeline.use(async (_ctx, next) => {
      callOrder.push('m2-before');
      await next();
      callOrder.push('m2-after');
    });

    const target = vi.fn(async () => {
      callOrder.push('target');
    });

    await pipeline.execute(mockCtx, target);

    expect(callOrder).toEqual(['m1-before', 'm2-before', 'target', 'm2-after', 'm1-after']);
    expect(target).toHaveBeenCalledOnce();
  });

  it('short-circuits and prevents target execution if a middleware does not call next()', async () => {
    const callOrder: string[] = [];

    pipeline.use(async (_ctx, _next) => {
      callOrder.push('blocked');
      // Intentionally not calling next()
    });

    pipeline.use(async (_ctx, next) => {
      callOrder.push('should-not-run');
      await next();
    });

    const target = vi.fn(async () => {
      callOrder.push('target');
    });

    await pipeline.execute(mockCtx, target);

    expect(callOrder).toEqual(['blocked']);
    expect(target).not.toHaveBeenCalled();
  });

  it('prevents calling next() multiple times in the same middleware', async () => {
    pipeline.use(async (_ctx, next) => {
      await next();
      await next(); // Invalid: second call
    });

    const target = vi.fn();

    await expect(pipeline.execute(mockCtx, target)).rejects.toThrow(
      'next() called multiple times in middleware chain',
    );
  });

  it('executes command-specific middlewares declared on command.metadata.middlewares', async () => {
    const callOrder: string[] = [];

    pipeline.use(async (_ctx, next) => {
      callOrder.push('global-before');
      await next();
      callOrder.push('global-after');
    });

    const mockCommand: Command = {
      metadata: {
        name: 'special',
        category: CommandCategory.GENERAL,
        description: 'Special command',
        middlewares: [
          async (_ctx, next) => {
            callOrder.push('cmd-middleware');
            await next();
          },
        ],
      },
      execute: vi.fn(),
    };

    const ctxWithCommand = {
      ...mockCtx,
      command: mockCommand,
    } as CommandContext;

    const target = vi.fn(async () => {
      callOrder.push('target');
    });

    await pipeline.execute(ctxWithCommand, target);

    expect(callOrder).toEqual(['global-before', 'cmd-middleware', 'target', 'global-after']);
  });

  it('invokes onError hook when target throws, and propagates error', async () => {
    const onError = vi.fn();
    const errorPipeline = new MiddlewarePipeline({ onError });

    const targetError = new Error('Target failed');
    const target = vi.fn(async () => {
      throw targetError;
    });

    await expect(errorPipeline.execute(mockCtx, target)).rejects.toThrow(targetError);
    expect(onError).toHaveBeenCalledWith(mockCtx, targetError);
  });

  it('supports clear() and length query', () => {
    expect(pipeline.length).toBe(0);
    pipeline.use(async (_ctx, next) => next());
    expect(pipeline.length).toBe(1);
    pipeline.clear();
    expect(pipeline.length).toBe(0);
  });
});

describe('CommandRouter & Error Boundary Integration (TASK-0321)', () => {
  let registry: CommandRegistry;
  let router: CommandRouter;

  beforeEach(() => {
    registry = new CommandRegistry();
    router = new CommandRouter(registry);
  });

  it('executes global router middlewares for slash commands', async () => {
    const trace: string[] = [];
    router.pipeline.use(async (_ctx, next) => {
      trace.push('middleware-hit');
      await next();
    });

    const testCmd: Command = {
      metadata: {
        name: 'ping',
        category: CommandCategory.GENERAL,
        description: 'Ping',
      },
      execute: vi.fn(async () => {
        trace.push('cmd-executed');
      }),
    };
    registry.register(testCmd);

    const mockInteraction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'ping',
      client: {},
      guild: null,
      guildId: null,
      channel: null,
      channelId: 'ch1',
      user: { id: 'u1' },
      member: null,
      replied: false,
      deferred: false,
      options: { getString: () => null },
    } as unknown as ChatInputCommandInteraction;

    const result = await router.dispatchInteraction(mockInteraction);

    expect(result).toBe(true);
    expect(trace).toEqual(['middleware-hit', 'cmd-executed']);
    expect(testCmd.execute).toHaveBeenCalledOnce();
  });

  it('formats custom error boundaries with specific icons for slash interactions', async () => {
    const mockReply = vi.fn().mockResolvedValue(undefined);

    const cooldownCmd: Command = {
      metadata: {
        name: 'gamble',
        category: CommandCategory.ECONOMY,
        description: 'Gamble coins',
      },
      execute: vi.fn(async () => {
        throw new CommandCooldownError('Wait 15 seconds before gambling again.', {
          retryAfterSeconds: 15,
        });
      }),
    };
    registry.register(cooldownCmd);

    const mockInteraction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'gamble',
      client: {},
      guild: null,
      guildId: null,
      channel: null,
      channelId: 'ch1',
      user: { id: 'u1' },
      member: null,
      replied: false,
      deferred: false,
      reply: mockReply,
      options: { getString: () => null },
    } as unknown as ChatInputCommandInteraction;

    await router.dispatchInteraction(mockInteraction);

    expect(mockReply).toHaveBeenCalledWith({
      content: '⏳ Wait 15 seconds before gambling again.',
      ephemeral: true,
    });
  });

  it('formats permissions and maintenance errors with dedicated icons', async () => {
    const mockReply = vi.fn().mockResolvedValue(undefined);

    const permCmd: Command = {
      metadata: {
        name: 'ban',
        category: CommandCategory.MODERATION,
        description: 'Ban user',
      },
      execute: vi.fn(async () => {
        throw new CommandPermissionError('You lack BanMembers permission.');
      }),
    };
    registry.register(permCmd);

    const mockInteraction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'ban',
      client: {},
      guild: null,
      guildId: null,
      channel: null,
      channelId: 'ch1',
      user: { id: 'u1' },
      member: null,
      replied: false,
      deferred: false,
      reply: mockReply,
      options: { getString: () => null },
    } as unknown as ChatInputCommandInteraction;

    await router.dispatchInteraction(mockInteraction);

    expect(mockReply).toHaveBeenCalledWith({
      content: '🚫 You lack BanMembers permission.',
      ephemeral: true,
    });
  });

  it('formats guild only and maintenance errors correctly on prefix messages', async () => {
    const mockReply = vi.fn().mockResolvedValue({ id: 'reply-1' });

    const guildCmd: Command = {
      metadata: {
        name: 'serverinfo',
        category: CommandCategory.UTILITY,
        description: 'Server info',
      },
      execute: vi.fn(async () => {
        throw new CommandGuildOnlyError();
      }),
    };
    registry.register(guildCmd);

    const mockMessage = {
      author: { id: 'u2', bot: false },
      system: false,
      content: '!serverinfo',
      client: { user: { id: 'bot-1' } },
      guild: null,
      guildId: null,
      channel: { id: 'ch2' },
      channelId: 'ch2',
      member: null,
      reply: mockReply,
    } as unknown as Message;

    await router.dispatchMessage(mockMessage);

    expect(mockReply).toHaveBeenCalledWith({
      content: '🏠 This command can only be used within a server.',
    });
  });

  it('formats maintenance, rate limit, and disabled errors with appropriate icons', async () => {
    const mockReply = vi.fn().mockResolvedValue(undefined);

    const testCmd: Command = {
      metadata: {
        name: 'ai',
        category: CommandCategory.AI,
        description: 'AI chat',
      },
      execute: vi
        .fn()
        .mockRejectedValueOnce(new CommandMaintenanceError())
        .mockRejectedValueOnce(
          new CommandRateLimitError('Rate limit exceeded. Try again in 30s.', {
            retryAfterSeconds: 30,
          }),
        )
        .mockRejectedValueOnce(
          new CommandDisabledError('The AI module is disabled in this server.'),
        ),
    };
    registry.register(testCmd);

    const mockInteraction = {
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'ai',
      client: {},
      guild: null,
      guildId: null,
      channel: null,
      channelId: 'ch1',
      user: { id: 'u1' },
      member: null,
      replied: false,
      deferred: false,
      reply: mockReply,
      options: { getString: () => null },
    } as unknown as ChatInputCommandInteraction;

    // 1. Maintenance
    await router.dispatchInteraction(mockInteraction);
    expect(mockReply).toHaveBeenLastCalledWith({
      content: '🛠️ Ririko is currently undergoing scheduled maintenance.',
      ephemeral: true,
    });

    // 2. Rate limit
    await router.dispatchInteraction(mockInteraction);
    expect(mockReply).toHaveBeenLastCalledWith({
      content: '⏱️ Rate limit exceeded. Try again in 30s.',
      ephemeral: true,
    });

    // 3. Disabled module
    await router.dispatchInteraction(mockInteraction);
    expect(mockReply).toHaveBeenLastCalledWith({
      content: '🔒 The AI module is disabled in this server.',
      ephemeral: true,
    });
  });
});
