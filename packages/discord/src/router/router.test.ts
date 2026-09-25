import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandRegistry } from './registry.js';
import { CommandRouter } from './router.js';
import { CommandCategory, type Command, type CommandContext } from '../command/types.js';
import { ValidationError, RirikoError, ErrorCode } from '@ririko/core';
import type {
  ChatInputCommandInteraction,
  Client,
  Message,
  User,
  AutocompleteInteraction,
} from 'discord.js';

describe('CommandRegistry (TASK-0312)', () => {
  let registry: CommandRegistry;

  const pingCommand: Command = {
    metadata: {
      name: 'ping',
      category: CommandCategory.GENERAL,
      description: 'Check bot latency',
      aliases: ['p', 'pong'],
    },
    execute: vi.fn(),
  };

  const playCommand: Command = {
    metadata: {
      name: 'play',
      category: CommandCategory.MUSIC,
      description: 'Play a track',
      aliases: ['p-music'],
    },
    execute: vi.fn(),
  };

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it('registers and resolves commands by primary name in O(1) time', () => {
    registry.register(pingCommand);

    expect(registry.get('ping')).toBe(pingCommand);
    expect(registry.has('ping')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('resolves commands by alias in O(1) time', () => {
    registry.register(pingCommand);

    expect(registry.get('p')).toBe(pingCommand);
    expect(registry.get('pong')).toBe(pingCommand);
    expect(registry.has('p')).toBe(true);
  });

  it('is case-insensitive for command and alias lookups', () => {
    registry.register(pingCommand);

    expect(registry.get('PING')).toBe(pingCommand);
    expect(registry.get('POnG')).toBe(pingCommand);
  });

  it('throws ValidationError on duplicate primary command registration', () => {
    registry.register(pingCommand);

    expect(() => registry.register(pingCommand)).toThrowError(ValidationError);
  });

  it('throws ValidationError when an alias collides with an existing command or alias', () => {
    registry.register(pingCommand);

    const collidingAliasCmd: Command = {
      metadata: {
        name: 'other',
        category: CommandCategory.GENERAL,
        description: 'Other',
        aliases: ['p'], // Already an alias of ping
      },
      execute: vi.fn(),
    };

    expect(() => registry.register(collidingAliasCmd)).toThrowError(ValidationError);
  });

  it('groups commands by category', () => {
    registry.registerAll([pingCommand, playCommand]);

    const musicCmds = registry.getByCategory(CommandCategory.MUSIC);
    expect(musicCmds).toHaveLength(1);
    expect(musicCmds[0]?.metadata.name).toBe('play');

    const generalCmds = registry.getByCategory(CommandCategory.GENERAL);
    expect(generalCmds).toHaveLength(1);
    expect(generalCmds[0]?.metadata.name).toBe('ping');
  });

  it('unregisters commands and removes all their aliases and category references', () => {
    registry.register(pingCommand);
    expect(registry.has('ping')).toBe(true);
    expect(registry.has('p')).toBe(true);

    const unregistered = registry.unregister('p'); // Unregister via alias
    expect(unregistered).toBe(true);
    expect(registry.has('ping')).toBe(false);
    expect(registry.has('p')).toBe(false);
    expect(registry.getByCategory(CommandCategory.GENERAL)).toHaveLength(0);
    expect(registry.size).toBe(0);
  });
});

describe('CommandRouter Dual Dispatcher (TASK-0312)', () => {
  let registry: CommandRegistry;
  let router: CommandRouter;

  const sampleCommand: Command = {
    metadata: {
      name: 'echo',
      category: CommandCategory.UTILITY,
      description: 'Echoes back the message',
      aliases: ['repeat'],
      options: [{ name: 'text', type: 'STRING', description: 'Text to repeat', required: true }],
    },
    execute: vi.fn(async (ctx: CommandContext) => {
      const text = ctx.options.getString('text', true);
      await ctx.reply(`Echo: ${text}`);
    }),
  };

  const failingCommand: Command = {
    metadata: {
      name: 'fail',
      category: CommandCategory.ADMIN,
      description: 'Always fails',
    },
    execute: vi.fn(async () => {
      throw new RirikoError('Unauthorized action', {
        code: ErrorCode.UNAUTHORIZED,
        statusCode: 403,
        userMessage: 'You do not have permission to execute this operation.',
      });
    }),
  };

  beforeEach(() => {
    registry = new CommandRegistry();
    registry.register(sampleCommand);
    registry.register(failingCommand);
    router = new CommandRouter(registry, { defaultPrefix: '!' });
  });

  describe('Slash Command Dispatch', () => {
    it('dispatches valid slash command to execute', async () => {
      const mockReply = vi.fn().mockResolvedValue(undefined);
      const mockInteraction = {
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        commandName: 'echo',
        client: {} as unknown as Client,
        user: { id: 'user-1' } as unknown as User,
        replied: false,
        deferred: false,
        reply: mockReply,
        options: {
          getString: vi.fn().mockReturnValue('Hello Antigravity'),
        },
      } as unknown as ChatInputCommandInteraction;

      const handled = await router.dispatchInteraction(mockInteraction);

      expect(handled).toBe(true);
      expect(sampleCommand.execute).toHaveBeenCalled();
      expect(mockReply).toHaveBeenCalledWith('Echo: Hello Antigravity');
    });

    it('sets both ctx.commandName and ctx.invokedName to the slash command name (TASK-1301)', async () => {
      let seenCtx: CommandContext | undefined;
      (sampleCommand.execute as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async (ctx: CommandContext) => {
          seenCtx = ctx;
          await ctx.reply('ok');
        },
      );

      const mockInteraction = {
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        commandName: 'echo',
        client: {} as unknown as Client,
        user: { id: 'user-1' } as unknown as User,
        replied: false,
        deferred: false,
        reply: vi.fn().mockResolvedValue(undefined),
        options: { getString: vi.fn().mockReturnValue('hi') },
      } as unknown as ChatInputCommandInteraction;

      const handled = await router.dispatchInteraction(mockInteraction);

      expect(handled).toBe(true);
      expect(seenCtx?.commandName).toBe('echo');
      expect(seenCtx?.invokedName).toBe('echo');
    });

    it('returns false for unregistered slash command', async () => {
      const mockInteraction = {
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        commandName: 'unknown_command',
      } as unknown as ChatInputCommandInteraction;

      const handled = await router.dispatchInteraction(mockInteraction);
      expect(handled).toBe(false);
    });

    it('handles autocomplete interactions', async () => {
      const mockAutocompleteFn = vi.fn().mockResolvedValue(undefined);
      const autocompleteCmd: Command = {
        metadata: {
          name: 'search',
          category: CommandCategory.GENERAL,
          description: 'Search',
        },
        execute: vi.fn(),
        autocomplete: mockAutocompleteFn,
      };
      registry.register(autocompleteCmd);

      const mockInteraction = {
        isAutocomplete: () => true,
        isChatInputCommand: () => false,
        commandName: 'search',
      } as unknown as AutocompleteInteraction;

      const handled = await router.dispatchInteraction(mockInteraction);
      expect(handled).toBe(true);
      expect(mockAutocompleteFn).toHaveBeenCalledWith(mockInteraction);
    });

    it('handles thrown errors and replies with userMessage', async () => {
      const mockReply = vi.fn().mockResolvedValue(undefined);
      const mockInteraction = {
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        commandName: 'fail',
        client: {} as unknown as Client,
        user: { id: 'user-1' } as unknown as User,
        replied: false,
        deferred: false,
        reply: mockReply,
        options: {},
      } as unknown as ChatInputCommandInteraction;

      const handled = await router.dispatchInteraction(mockInteraction);
      expect(handled).toBe(true);
      expect(mockReply).toHaveBeenCalledWith({
        content: '❌ You do not have permission to execute this operation.',
        ephemeral: true,
      });
    });
  });

  describe('Prefix Command Dispatch', () => {
    it('dispatches valid prefix command by primary name', async () => {
      const mockReply = vi.fn().mockResolvedValue(undefined);
      const mockMessage = {
        author: { bot: false, id: 'user-1' },
        system: false,
        content: '!echo "Hello from prefix"',
        client: { user: { id: 'bot-1' } },
        reply: mockReply,
      } as unknown as Message;

      const handled = await router.dispatchMessage(mockMessage);

      expect(handled).toBe(true);
      expect(sampleCommand.execute).toHaveBeenCalled();
      expect(mockReply).toHaveBeenCalledWith({ content: 'Echo: Hello from prefix' });
    });

    it('dispatches prefix command using an alias', async () => {
      const mockReply = vi.fn().mockResolvedValue(undefined);
      const mockMessage = {
        author: { bot: false, id: 'user-1' },
        system: false,
        content: '!repeat "Repeated message"',
        client: { user: { id: 'bot-1' } },
        reply: mockReply,
      } as unknown as Message;

      const handled = await router.dispatchMessage(mockMessage);

      expect(handled).toBe(true);
      expect(mockReply).toHaveBeenCalledWith({ content: 'Echo: Repeated message' });
    });

    it('surfaces the typed alias via ctx.invokedName while ctx.commandName stays canonical (TASK-1301)', async () => {
      const mockReply = vi.fn().mockResolvedValue(undefined);
      let seenCtx: CommandContext | undefined;
      const aliasAwareCommand: Command = {
        metadata: {
          name: 'react',
          category: CommandCategory.REACTIONS,
          description: 'Unified reaction command',
          aliases: ['hug'],
        },
        execute: vi.fn(async (ctx: CommandContext) => {
          seenCtx = ctx;
          await ctx.reply('done');
        }),
      };
      registry.register(aliasAwareCommand);

      const mockMessage = {
        author: { bot: false, id: 'user-1' },
        system: false,
        content: '!hug @friend',
        client: { user: { id: 'bot-1' } },
        reply: mockReply,
      } as unknown as Message;

      const handled = await router.dispatchMessage(mockMessage);

      expect(handled).toBe(true);
      expect(seenCtx?.commandName).toBe('react');
      expect(seenCtx?.invokedName).toBe('hug');
    });

    it('sets ctx.invokedName to the primary name when a command is invoked directly', async () => {
      let seenCtx: CommandContext | undefined;
      (sampleCommand.execute as ReturnType<typeof vi.fn>).mockImplementationOnce(
        async (ctx: CommandContext) => {
          seenCtx = ctx;
          await ctx.reply('ok');
        },
      );

      const mockMessage = {
        author: { bot: false, id: 'user-1' },
        system: false,
        content: '!echo "direct"',
        client: { user: { id: 'bot-1' } },
        reply: vi.fn().mockResolvedValue(undefined),
      } as unknown as Message;

      const handled = await router.dispatchMessage(mockMessage);

      expect(handled).toBe(true);
      expect(seenCtx?.commandName).toBe('echo');
      expect(seenCtx?.invokedName).toBe('echo');
    });

    it('dispatches command using bot mention prefix', async () => {
      const mockReply = vi.fn().mockResolvedValue(undefined);
      const mockMessage = {
        author: { bot: false, id: 'user-1' },
        system: false,
        content: '<@bot-1> echo MentionPrefixTest',
        client: { user: { id: 'bot-1' } },
        reply: mockReply,
      } as unknown as Message;

      const handled = await router.dispatchMessage(mockMessage);

      expect(handled).toBe(true);
      expect(mockReply).toHaveBeenCalledWith({ content: 'Echo: MentionPrefixTest' });
    });

    it('ignores bot messages', async () => {
      const mockMessage = {
        author: { bot: true },
        content: '!echo Hello',
      } as unknown as Message;

      const handled = await router.dispatchMessage(mockMessage);
      expect(handled).toBe(false);
    });

    it('ignores non-command messages', async () => {
      const mockMessage = {
        author: { bot: false },
        system: false,
        content: 'just a normal chatter message',
        client: { user: { id: 'bot-1' } },
      } as unknown as Message;

      const handled = await router.dispatchMessage(mockMessage);
      expect(handled).toBe(false);
    });

    it('supports custom dynamic prefix resolver', async () => {
      const customRouter = new CommandRouter(registry, {
        resolvePrefix: (msg) => (msg.guildId === 'guild-custom' ? '?' : '!'),
      });

      const mockReply = vi.fn().mockResolvedValue(undefined);
      const mockMessage = {
        author: { bot: false, id: 'user-1' },
        system: false,
        guildId: 'guild-custom',
        content: '?echo CustomPrefixWorks',
        client: { user: { id: 'bot-1' } },
        reply: mockReply,
      } as unknown as Message;

      const handled = await customRouter.dispatchMessage(mockMessage);
      expect(handled).toBe(true);
      expect(mockReply).toHaveBeenCalledWith({ content: 'Echo: CustomPrefixWorks' });
    });
  });

  describe('Client Event Binding', () => {
    it('binds interactionCreate and messageCreate to client', () => {
      const mockClient = {
        on: vi.fn(),
      } as unknown as Client;

      router.bindClient(mockClient);

      expect(mockClient.on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
    });
  });
});

describe('CommandRouter onCommandRun hook (TASK-1131)', () => {
  const command: Command = {
    metadata: { name: 'echo', category: CommandCategory.GENERAL, description: 'Echo' },
    execute: vi.fn(),
  };

  const interaction = () =>
    ({
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      commandName: 'echo',
      client: {} as unknown as Client,
      user: { id: 'user-1' } as unknown as User,
      replied: false,
      deferred: false,
      reply: vi.fn().mockResolvedValue(undefined),
      options: {},
    }) as unknown as ChatInputCommandInteraction;

  const routerWith = (options: ConstructorParameters<typeof CommandRouter>[1]) => {
    const registry = new CommandRegistry();
    registry.register(command);
    return new CommandRouter(registry, options);
  };

  beforeEach(() => {
    vi.mocked(command.execute).mockClear();
  });

  it('reports each command that passes the pipeline, before it executes', async () => {
    const order: string[] = [];
    vi.mocked(command.execute).mockImplementationOnce(async () => {
      order.push('execute');
    });
    const router = routerWith({
      onCommandRun: (ctx) => order.push(`run:${ctx.commandName}`),
    });

    await router.dispatchInteraction(interaction());

    expect(order).toEqual(['run:echo', 'execute']);
  });

  it('does not report a command a middleware stops', async () => {
    const onCommandRun = vi.fn();
    const router = routerWith({
      onCommandRun,
      middlewares: [
        async () => {
          throw new RirikoError('Blocked', { code: ErrorCode.UNAUTHORIZED, statusCode: 403 });
        },
      ],
    });

    await router.dispatchInteraction(interaction());

    expect(onCommandRun).not.toHaveBeenCalled();
    expect(command.execute).not.toHaveBeenCalled();
  });

  it('still executes the command when the hook throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = routerWith({
      onCommandRun: () => {
        throw new Error('hook failed');
      },
    });

    await router.dispatchInteraction(interaction());

    expect(command.execute).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
