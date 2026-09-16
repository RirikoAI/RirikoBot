import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseClient, type SqliteDatabaseClient } from '@ririko/database';
import { createBotServices, type BotServices } from '../services.js';
import { AiChatController } from './ai-chat.controller.js';
import type { Client, Message, TextChannel } from 'discord.js';
import type {
  ChatModelProvider,
  ChatRequest,
  ChatResponse,
  ChatToken,
  ToolCall,
} from '@ririko/ai';

class MockAiProvider implements ChatModelProvider {
  readonly id = 'mock-provider';
  readonly name = 'Mock Provider';
  readonly isAvailable = true;
  readonly supportedModels = ['mock-model'];
  readonly defaultModel = 'mock-model';

  public responseText = 'Hello from Ririko AI!';
  public responseToolCalls?: ToolCall[];
  public streamTokens: string[] = ['Hello', ' from', ' Ririko', ' AI!'];

  async generate(_request: ChatRequest): Promise<ChatResponse> {
    return {
      content: this.responseText,
      model: 'mock-model',
      provider: 'mock-provider',
      toolCalls: this.responseToolCalls,
    };
  }

  async *stream(_request: ChatRequest): AsyncIterable<ChatToken> {
    for (let i = 0; i < this.streamTokens.length; i++) {
      const text = this.streamTokens[i]!;
      const isFinished = i === this.streamTokens.length - 1;
      yield {
        text,
        isFinished,
        toolCalls: isFinished ? this.responseToolCalls : undefined,
      };
    }
  }
}

describe('AiChatController & Dedicated #ririko-ai Gateway Listener (TASK-0631)', () => {
  let dbClient: SqliteDatabaseClient;
  let services: BotServices;
  let mockProvider: MockAiProvider;
  let controller: AiChatController;
  let mockClient: Client;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    dbClient = rawClient;

    dbClient.raw.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        profile_background_url TEXT,
        is_blacklisted INTEGER NOT NULL DEFAULT 0,
        warn_count INTEGER NOT NULL DEFAULT 0,
        notify_level_up INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE guild_settings (
        guild_id TEXT PRIMARY KEY,
        prefix TEXT NOT NULL DEFAULT '!',
        language TEXT NOT NULL DEFAULT 'en',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        welcome_channel_id TEXT,
        leave_channel_id TEXT,
        log_channel_id TEXT,
        autorole_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE ai_channels (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL
      );

      CREATE TABLE ai_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        guild_id TEXT,
        channel_id TEXT,
        provider TEXT NOT NULL DEFAULT 'GEMINI',
        model TEXT NOT NULL,
        summary TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_calls TEXT,
        token_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE ai_guild_preferences (
        guild_id TEXT PRIMARY KEY,
        personality_prompt TEXT,
        speaking_style TEXT NOT NULL DEFAULT 'FRIENDLY_ANIME',
        allowed_tools TEXT NOT NULL DEFAULT '[]',
        model_override TEXT
      );

      CREATE TABLE ai_user_preferences (
        user_id TEXT PRIMARY KEY,
        nickname TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        language_preference TEXT NOT NULL DEFAULT 'en'
      );
    `);

    services = await createBotServices(dbClient);

    mockProvider = new MockAiProvider();
    services.fallbackChainManager.registerProvider(mockProvider);

    mockClient = {
      user: { id: 'bot-ririko-999' },
    } as unknown as Client;

    controller = new AiChatController(mockClient, services, {
      minEditIntervalMs: 20, // fast edits for testing
    });
  });

  const createMockMessage = (options: {
    content: string;
    channelId?: string;
    guildId?: string | null;
    userId?: string;
    isBot?: boolean;
    mentionsBot?: boolean;
  }): {
    message: Message;
    replyMsg: { id: string; content: string; edit: ReturnType<typeof vi.fn> };
    edits: string[];
  } => {
    const edits: string[] = [];
    const replyMsg = {
      id: 'reply-msg-1',
      content: '',
      edit: vi.fn(async (data: { content: string }) => {
        edits.push(data.content);
        replyMsg.content = data.content;
        return replyMsg;
      }),
    };

    const mentionsSet = new Set<string>();
    if (options.mentionsBot) {
      mentionsSet.add('bot-ririko-999');
    }

    const mockChannel = {
      id: options.channelId ?? 'channel-general',
      sendTyping: vi.fn(async () => {}),
      send: vi.fn(async (_data: unknown) => {}),
    } as unknown as TextChannel;

    const message = {
      id: 'msg-user-1',
      content: options.content,
      channelId: options.channelId ?? 'channel-general',
      channel: mockChannel,
      guild: options.guildId !== null ? { id: options.guildId ?? 'guild-1', name: 'Test Guild' } : null,
      author: {
        id: options.userId ?? 'user-alice',
        username: 'Alice',
        displayName: 'Ali',
        bot: options.isBot ?? false,
      },
      member: {
        permissions: { bitfield: 3145728n },
        roles: { highest: { position: 10 } },
        joinedAt: new Date('2025-01-01'),
      },
      mentions: {
        has: (id: string) => mentionsSet.has(id),
      },
      reply: vi.fn(async (data: { content: string }) => {
        replyMsg.content = data.content;
        edits.push(data.content);
        return replyMsg as unknown as Message;
      }),
    } as unknown as Message;

    return { message, replyMsg, edits };
  };

  describe('1. Gateway Channel Routing & Mentions', () => {
    it('ignores bot authors and DMs', async () => {
      const { message: botMsg } = createMockMessage({
        content: 'Hello',
        isBot: true,
      });
      expect(await controller.handleAiMessage(botMsg)).toBe(false);

      const { message: dmMsg } = createMockMessage({
        content: 'Hello',
        guildId: null,
      });
      expect(await controller.handleAiMessage(dmMsg)).toBe(false);
    });

    it('ignores messages in standard channels when bot is not mentioned', async () => {
      const { message } = createMockMessage({
        content: 'Random talk in general chat',
        channelId: 'channel-general',
        mentionsBot: false,
      });

      const handled = await controller.handleAiMessage(message);
      expect(handled).toBe(false);
    });

    it('routes messages in dedicated AI channel automatically without prefix or mention', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'channel-ririko-ai');

      const { message, edits } = createMockMessage({
        content: 'What is your favorite anime?',
        channelId: 'channel-ririko-ai',
        mentionsBot: false,
      });

      const handled = await controller.handleAiMessage(message);
      expect(handled).toBe(true);
      expect(message.reply).toHaveBeenCalled();
      expect(edits.length).toBeGreaterThan(0);
    });

    it('routes messages in any channel when bot is explicitly mentioned', async () => {
      const { message, edits } = createMockMessage({
        content: '<@bot-ririko-999> Tell me a joke!',
        channelId: 'channel-general',
        mentionsBot: true,
      });

      const handled = await controller.handleAiMessage(message);
      expect(handled).toBe(true);
      expect(message.reply).toHaveBeenCalled();
      expect(edits[edits.length - 1]).toContain('Hello from Ririko AI!');
    });

    it('replies with greeting when mention is empty', async () => {
      const { message } = createMockMessage({
        content: '<@bot-ririko-999>',
        channelId: 'channel-general',
        mentionsBot: true,
      });

      const handled = await controller.handleAiMessage(message);
      expect(handled).toBe(true);
      expect(message.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('Konnichiwa! I am Ririko!'),
      });
    });
  });

  describe('2. Debounced Streaming & Edits', () => {
    it('debounces rapid token edits and flushes final accumulated response', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'channel-ai');

      mockProvider.streamTokens = ['Part 1', ' Part 2', ' Part 3', ' Final!'];

      const { message, edits } = createMockMessage({
        content: 'Stream test',
        channelId: 'channel-ai',
      });

      await controller.handleAiMessage(message);

      // Initial placeholder was '💭 *Thinking...*'
      expect(edits[0]).toBe('💭 *Thinking...*');
      // Final edit contains the full streamed text
      expect(edits[edits.length - 1]).toBe('Part 1 Part 2 Part 3 Final!');
    });
  });

  describe('3. Isolated Memory & Preferences', () => {
    it('persists conversational turns with per-user isolation', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'channel-ai');

      const { message: aliceMsg } = createMockMessage({
        content: 'Hello I am Alice',
        channelId: 'channel-ai',
        userId: 'alice-1',
      });
      await controller.handleAiMessage(aliceMsg);

      const aliceHistory = await services.conversationManager.getContextMessages({
        userId: 'alice-1',
        guildId: 'guild-1',
        channelId: 'channel-ai',
      });
      expect(aliceHistory).toHaveLength(2);
      expect(aliceHistory[0]?.content).toBe('Hello I am Alice');

      // Bob has zero history in the same channel
      const bobHistory = await services.conversationManager.getContextMessages({
        userId: 'bob-2',
        guildId: 'guild-1',
        channelId: 'channel-ai',
      });
      expect(bobHistory).toHaveLength(0);
    });
  });

  describe('4. Tool Calling Integration', () => {
    it('executes tool calls and appends structured tool summaries', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'channel-ai');

      mockProvider.responseToolCalls = [
        {
          id: 'call-clock-1',
          name: 'get_current_time',
          arguments: { timezone: 'UTC' },
        },
      ];

      const { message, edits } = createMockMessage({
        content: 'What time is it in UTC?',
        channelId: 'channel-ai',
      });

      await controller.handleAiMessage(message);

      const finalContent = edits[edits.length - 1];
      expect(finalContent).toContain('get_current_time');
      expect(finalContent).toContain('UTC');
    });
  });

  describe('5. Channel Cache Invalidation', () => {
    it('invalidates cache when channel mapping updates', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'ch-1');
      expect(await controller.getDedicatedChannelId('guild-1')).toBe('ch-1');

      // Update in DB
      await services.aiRepo.setAiChannel('guild-1', 'ch-2');

      // Still cached as ch-1
      expect(await controller.getDedicatedChannelId('guild-1')).toBe('ch-1');

      // Invalidate cache
      controller.invalidateChannelCache('guild-1');
      expect(await controller.getDedicatedChannelId('guild-1')).toBe('ch-2');
    });
  });
});
