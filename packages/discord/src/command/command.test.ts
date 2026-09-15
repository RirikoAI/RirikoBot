import { describe, it, expect, vi } from 'vitest';
import { tokenizeCommandArgs } from './tokenizer.js';
import { PrefixOptionsResolver, SlashOptionsResolver } from './options.js';
import { PrefixCommandContext, SlashCommandContext } from './context.js';
import type { CommandOptionDefinition } from './types.js';
import { ValidationError } from '@ririko/core';
import type { ChatInputCommandInteraction, Client, Message, User } from 'discord.js';

describe('Command Argument Tokenizer (TASK-0311)', () => {
  it('tokenizes simple whitespace-separated words', () => {
    expect(tokenizeCommandArgs('ban @user 7d spamming')).toEqual([
      'ban',
      '@user',
      '7d',
      'spamming',
    ]);
  });

  it('handles double and single quoted strings with spaces', () => {
    expect(tokenizeCommandArgs('play "YOASOBI Idol" \'Another Track\' --loop')).toEqual([
      'play',
      'YOASOBI Idol',
      'Another Track',
      '--loop',
    ]);
  });

  it('handles escaped quotes inside quoted strings', () => {
    expect(tokenizeCommandArgs('echo "He said \\"Hello\\" to everyone"')).toEqual([
      'echo',
      'He said "Hello" to everyone',
    ]);
  });

  it('returns empty array for empty or whitespace-only strings', () => {
    expect(tokenizeCommandArgs('')).toEqual([]);
    expect(tokenizeCommandArgs('   \t\n  ')).toEqual([]);
  });
});

describe('PrefixOptionsResolver (TASK-0311)', () => {
  const definitions: CommandOptionDefinition[] = [
    { name: 'user', type: 'USER', required: true, description: 'Target user' },
    { name: 'amount', type: 'INTEGER', required: true, description: 'Amount to pay' },
    { name: 'taxable', type: 'BOOLEAN', description: 'Apply tax' },
    { name: 'note', type: 'STRING', description: 'Transaction note' },
  ];

  const mockUser = { id: '123456789012345678', tag: 'Alice#0001' } as unknown as User;
  const mockClient = {
    users: {
      cache: new Map([['123456789012345678', mockUser]]),
      fetch: vi.fn().mockResolvedValue(mockUser),
    },
    channels: {
      cache: new Map(),
      fetch: vi.fn().mockResolvedValue({ id: '987654321098765432' }),
    },
  } as unknown as Client;

  const mockMessage = {
    id: 'msg-1',
    guildId: 'guild-1',
    guild: {
      members: {
        cache: new Map(),
        fetch: vi.fn().mockResolvedValue({ id: '123456789012345678' }),
      },
    },
    attachments: {
      first: vi.fn().mockReturnValue({ id: 'att-1', url: 'https://example.com/file.png' }),
    },
  } as unknown as Message;

  it('resolves positional arguments matching schema definitions', async () => {
    const rawArgs = ['<@123456789012345678>', '500', 'yes', 'lunch', 'money'];
    const resolver = new PrefixOptionsResolver(
      mockMessage as Message,
      rawArgs,
      definitions,
      mockClient as Client,
    );

    const user = await resolver.getUser('user');
    expect(user).toBeDefined();
    expect(user?.id).toBe('123456789012345678');

    expect(resolver.getInteger('amount')).toBe(500);
    expect(resolver.getBoolean('taxable')).toBe(true);

    // Last STRING option joins remaining tokens
    expect(resolver.getString('note')).toBe('lunch money');
  });

  it('throws ValidationError when a required option is missing', () => {
    const resolver = new PrefixOptionsResolver(
      mockMessage as Message,
      [],
      definitions,
      mockClient as Client,
    );

    expect(() => resolver.getInteger('amount', true)).toThrowError(ValidationError);
  });

  it('validates integer formatting', () => {
    const resolver = new PrefixOptionsResolver(
      mockMessage as Message,
      ['<@123456789012345678>', 'not_a_number'],
      definitions,
      mockClient as Client,
    );

    expect(() => resolver.getInteger('amount', true)).toThrowError(ValidationError);
  });

  it('parses boolean variations correctly', () => {
    const checkBool = (val: string) => {
      const resolver = new PrefixOptionsResolver(
        mockMessage as Message,
        ['<@123456789012345678>', '10', val],
        definitions,
        mockClient as Client,
      );
      return resolver.getBoolean('taxable');
    };

    expect(checkBool('true')).toBe(true);
    expect(checkBool('yes')).toBe(true);
    expect(checkBool('1')).toBe(true);
    expect(checkBool('false')).toBe(false);
    expect(checkBool('no')).toBe(false);
    expect(checkBool('0')).toBe(false);
  });

  it('resolves attachments and channels', async () => {
    const resolver = new PrefixOptionsResolver(
      mockMessage as Message,
      ['<#987654321098765432>'],
      [{ name: 'channel', type: 'CHANNEL', description: 'Log channel' }],
      mockClient as Client,
    );

    const channel = await resolver.getChannel('channel');
    expect(channel?.id).toBe('987654321098765432');

    const attachment = resolver.getAttachment('file');
    expect(attachment?.id).toBe('att-1');
  });
});

describe('SlashOptionsResolver (TASK-0311)', () => {
  it('delegates to ChatInputCommandInteraction.options', async () => {
    const mockInteraction = {
      options: {
        getString: vi.fn().mockReturnValue('sample string'),
        getInteger: vi.fn().mockReturnValue(42),
        getNumber: vi.fn().mockReturnValue(3.14),
        getBoolean: vi.fn().mockReturnValue(true),
        getUser: vi.fn().mockReturnValue({ id: 'u1' }),
        getMember: vi.fn().mockReturnValue({ id: 'm1' }),
        getChannel: vi.fn().mockReturnValue({ id: 'c1' }),
        getAttachment: vi.fn().mockReturnValue({ id: 'a1' }),
      },
    } as unknown as ChatInputCommandInteraction;

    const resolver = new SlashOptionsResolver(mockInteraction);

    expect(resolver.getString('name')).toBe('sample string');
    expect(resolver.getInteger('count')).toBe(42);
    expect(resolver.getNumber('ratio')).toBe(3.14);
    expect(resolver.getBoolean('flag')).toBe(true);
    expect((await resolver.getUser('user'))?.id).toBe('u1');
    expect((await resolver.getMember('member'))?.id).toBe('m1');
    expect((await resolver.getChannel('channel'))?.id).toBe('c1');
    expect(resolver.getAttachment('file')?.id).toBe('a1');
  });
});

describe('Unified CommandContext (TASK-0311)', () => {
  it('normalizes SlashCommandContext properly', async () => {
    const mockReply = vi.fn().mockResolvedValue({ id: 'resp-1' });
    const mockDefer = vi.fn().mockResolvedValue(undefined);
    const mockEdit = vi.fn().mockResolvedValue({ id: 'resp-1-edited' });

    const mockInteraction = {
      id: 'slash-1',
      commandName: 'ping',
      client: {} as unknown as Client,
      guild: { id: 'g1' },
      guildId: 'g1',
      channel: { id: 'ch1', send: vi.fn() },
      channelId: 'ch1',
      user: { id: 'usr1' },
      member: { id: 'mbr1' },
      replied: false,
      deferred: false,
      reply: mockReply,
      deferReply: mockDefer,
      editReply: mockEdit,
      options: {
        getString: vi.fn().mockReturnValue(null),
      },
    } as unknown as ChatInputCommandInteraction;

    const ctx = new SlashCommandContext(mockInteraction);

    expect(ctx.source).toBe('slash');
    expect(ctx.commandName).toBe('ping');
    expect(ctx.invokedPrefix).toBe('/');
    expect(ctx.user.id).toBe('usr1');

    await ctx.reply('Pong!');
    expect(mockReply).toHaveBeenCalledWith('Pong!');

    await ctx.deferReply({ ephemeral: true });
    expect(mockDefer).toHaveBeenCalledWith({ ephemeral: true });
  });

  it('normalizes PrefixCommandContext properly', async () => {
    const mockSentReply = {
      id: 'bot-msg-1',
      edit: vi.fn().mockResolvedValue({ id: 'bot-msg-1-edited' }),
    };
    const mockReply = vi.fn().mockResolvedValue(mockSentReply);
    const mockSendTyping = vi.fn().mockResolvedValue(undefined);

    const mockMessage = {
      id: 'msg-100',
      client: {} as unknown as Client,
      guild: { id: 'g1' },
      guildId: 'g1',
      channel: { id: 'ch1', sendTyping: mockSendTyping, send: vi.fn() },
      channelId: 'ch1',
      author: { id: 'usr2' },
      member: { id: 'mbr2' },
      reply: mockReply,
    } as unknown as Message;

    const ctx = new PrefixCommandContext(
      mockMessage,
      'help',
      '!',
      ['music'],
      [{ name: 'category', type: 'STRING', description: 'Category name' }],
    );

    expect(ctx.source).toBe('prefix');
    expect(ctx.commandName).toBe('help');
    expect(ctx.invokedPrefix).toBe('!');
    expect(ctx.user.id).toBe('usr2');
    expect(ctx.options.getString('category')).toBe('music');

    await ctx.deferReply();
    expect(mockSendTyping).toHaveBeenCalled();

    const replyMsg = await ctx.reply('Help output');
    expect(replyMsg).toBe(mockSentReply);
    expect(ctx.isReplied).toBe(true);

    await ctx.editReply('Updated help output');
    expect(mockSentReply.edit).toHaveBeenCalledWith('Updated help output');
  });
});
