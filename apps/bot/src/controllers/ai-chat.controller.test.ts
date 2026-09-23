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
  public synthesisText?: string;
  public recordedRequests: ChatRequest[] = [];

  async generate(request: ChatRequest): Promise<ChatResponse> {
    this.recordedRequests.push(request);
    const isSynthesis = !request.tools && request.messages.some((m) => m.role === 'tool');
    const content = isSynthesis && this.synthesisText !== undefined ? this.synthesisText : this.responseText;

    return {
      content,
      model: 'mock-model',
      provider: 'mock-provider',
      toolCalls: request.tools ? this.responseToolCalls : undefined,
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatToken> {
    this.recordedRequests.push(request);
    const isSynthesis = !request.tools && request.messages.some((m) => m.role === 'tool');

    if (isSynthesis && this.synthesisText !== undefined) {
      yield { text: this.synthesisText, isFinished: true };
      return;
    }

    for (let i = 0; i < this.streamTokens.length; i++) {
      const text = this.streamTokens[i]!;
      const isFinished = i === this.streamTokens.length - 1;
      yield {
        text,
        isFinished,
        toolCalls: isFinished && request.tools ? this.responseToolCalls : undefined,
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
        locale TEXT NOT NULL DEFAULT 'en-US',
        timezone TEXT NOT NULL DEFAULT 'UTC',
        ai_channel_id TEXT,
        log_channel_id TEXT,
        music_channel_id TEXT,
        welcomer_channel_id TEXT,
        welcomer_enabled INTEGER NOT NULL DEFAULT 0,
        welcomer_bg TEXT,
        farewell_channel_id TEXT,
        farewell_enabled INTEGER NOT NULL DEFAULT 0,
        farewell_bg TEXT,
        karma_notifications_enabled INTEGER NOT NULL DEFAULT 1,
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

      CREATE TABLE economy_balances (
        user_id TEXT PRIMARY KEY,
        wallet_balance INTEGER NOT NULL DEFAULT 0,
        bank_balance INTEGER NOT NULL DEFAULT 0,
        bank_capacity INTEGER NOT NULL DEFAULT 10000,
        net_worth INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
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
    voiceChannelId?: string | null;
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
      guild: options.guildId !== null ? {
        id: options.guildId ?? 'guild-1',
        name: 'Test Guild',
        voiceAdapterCreator: () => ({}),
        members: {
          me: {
            permissions: { bitfield: 3145728n },
            roles: { highest: { position: 99 } },
          },
        },
      } : null,
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
        voice: {
          channelId: options.voiceChannelId ?? null,
        },
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

    it('completely ignores messages starting with command prefix in dedicated channel', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'channel-ririko-ai');

      const { message } = createMockMessage({
        content: '!balance',
        channelId: 'channel-ririko-ai',
        mentionsBot: false,
      });

      const handled = await controller.handleAiMessage(message);
      expect(handled).toBe(false);
      expect(message.reply).not.toHaveBeenCalled();
    });

    it('completely ignores default prefix (!) commands in dedicated channel', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'channel-ririko-ai');

      const { message } = createMockMessage({
        content: '!help',
        channelId: 'channel-ririko-ai',
        mentionsBot: false,
      });

      const handled = await controller.handleAiMessage(message);
      expect(handled).toBe(false);
      expect(message.reply).not.toHaveBeenCalled();
    });

    it('completely ignores prefix commands when bot is mentioned', async () => {
      const { message } = createMockMessage({
        content: '<@bot-ririko-999> !balance',
        channelId: 'channel-general',
        mentionsBot: true,
      });

      const handled = await controller.handleAiMessage(message);
      expect(handled).toBe(false);
      expect(message.reply).not.toHaveBeenCalled();
    });

    it('respects dynamic custom guild prefix from guild settings', async () => {
      await services.aiRepo.setAiChannel('guild-custom', 'channel-custom-ai');
      await services.guildSettingsRepo.create({
        guildId: 'guild-custom',
        prefix: '?',
      });

      const { message } = createMockMessage({
        content: '?rank',
        guildId: 'guild-custom',
        channelId: 'channel-custom-ai',
        mentionsBot: false,
      });

      const handled = await controller.handleAiMessage(message);
      expect(handled).toBe(false);
      expect(message.reply).not.toHaveBeenCalled();
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
    it('executes tool calls once and synthesizes natural language response', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'channel-ai');

      mockProvider.responseToolCalls = [
        {
          id: 'call-clock-1',
          name: 'get_current_time',
          arguments: { timezone: 'UTC' },
        },
      ];
      // Streaming initially emits tool calls with empty text
      mockProvider.streamTokens = [''];
      mockProvider.synthesisText = 'The current time in UTC is 8:44 AM!';

      const { message, edits } = createMockMessage({
        content: 'What time is it in UTC?',
        channelId: 'channel-ai',
      });

      await controller.handleAiMessage(message);

      // Intermediate edit showed tool execution status
      expect(edits).toContain('🔧 *Using get_current_time...*');
      // Final edit contains the synthesized natural response
      const finalContent = edits[edits.length - 1];
      expect(finalContent).toBe('The current time in UTC is 8:44 AM!');

      // Verify that tool call was executed only once (synthesis request received exactly 1 tool result)
      const synthesisReq = mockProvider.recordedRequests.find(
        (r) => !r.tools && r.messages.some((m) => m.role === 'tool'),
      );
      expect(synthesisReq).toBeDefined();
      const toolMessages = synthesisReq?.messages.filter((m) => m.role === 'tool');
      expect(toolMessages).toHaveLength(1);
      expect(toolMessages?.[0]?.toolCallId).toBe('call-clock-1');
    });

    it('falls back to clean formatted markdown when LLM synthesis fails', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'channel-ai');

      mockProvider.responseToolCalls = [
        {
          id: 'call-clock-1',
          name: 'get_current_time',
          arguments: { timezone: 'UTC' },
        },
      ];
      mockProvider.streamTokens = [''];
      mockProvider.synthesisText = '';
      mockProvider.responseText = '';

      const { message, edits } = createMockMessage({
        content: 'What time is it in UTC?',
        channelId: 'channel-ai',
      });

      await controller.handleAiMessage(message);

      const finalContent = edits[edits.length - 1];
      // Expect clean markdown formatting, never raw JSON
      expect(finalContent).toContain('🕒 **Current Time**:');
      expect(finalContent).toContain('UTC');
      expect(finalContent).not.toContain('{"iso":');
    });

    it('resolves real database balance when economy.check_balance tool is invoked', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'channel-ai');

      // Seed economy balance for user in database
      await services.economyRepo.create({
        userId: 'user-sender-1',
        walletBalance: 250,
        bankBalance: 500,
        bankCapacity: 20000,
        netWorth: 750,
        updatedAt: new Date(),
      });

      mockProvider.responseToolCalls = [
        {
          id: 'call-economy-1',
          name: 'economy.check_balance',
          arguments: {},
        },
      ];
      mockProvider.streamTokens = [''];
      mockProvider.synthesisText = 'You have 250 credits in your wallet and 500 credits in the bank!';

      const { message, edits } = createMockMessage({
        content: 'Check my balance please',
        channelId: 'channel-ai',
        userId: 'user-sender-1',
      });

      await controller.handleAiMessage(message);

      const synthesisReq = mockProvider.recordedRequests.find(
        (r) => !r.tools && r.messages.some((m) => m.role === 'tool'),
      );
      expect(synthesisReq).toBeDefined();
      const toolMessage = synthesisReq?.messages.find((m) => m.role === 'tool');
      expect(toolMessage).toBeDefined();
      const toolResult = JSON.parse(toolMessage?.content || '{}');
      expect(toolResult.wallet).toBe(250);
      expect(toolResult.bank).toBe(500);
      expect(toolResult.netWorth).toBe(750);
      expect(toolResult.message).toContain('250 credits in wallet');
      expect(edits[edits.length - 1]).toBe('You have 250 credits in your wallet and 500 credits in the bank!');
    });

    it('reports actionable message when music.play is invoked and user is not in a voice channel', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'channel-ai');

      mockProvider.responseToolCalls = [
        {
          id: 'call-music-1',
          name: 'music.play',
          arguments: { query: 'Frieren opening song' },
        },
      ];
      mockProvider.streamTokens = [''];
      mockProvider.synthesisText = 'Please join a voice channel first so I can play music for you!';

      const { message, edits } = createMockMessage({
        content: 'Please play me the intro song for Frieren',
        channelId: 'channel-ai',
        voiceChannelId: null, // Not in voice channel
      });

      await controller.handleAiMessage(message);

      const synthesisReq = mockProvider.recordedRequests.find(
        (r) => !r.tools && r.messages.some((m) => m.role === 'tool'),
      );
      expect(synthesisReq).toBeDefined();
      const toolMessage = synthesisReq?.messages.find((m) => m.role === 'tool');
      expect(toolMessage).toBeDefined();
      const toolResult = JSON.parse(toolMessage?.content || '{}');
      expect(toolResult.action).toBe('error');
      expect(toolResult.message).toContain('connected to a voice channel');
      expect(edits[edits.length - 1]).toBe('Please join a voice channel first so I can play music for you!');
    });

    it('queues music through real musicPlayer service when user is in a voice channel', async () => {
      await services.aiRepo.setAiChannel('guild-1', 'channel-ai');

      // Mock musicPlayer.play to simulate queuing
      const playSpy = vi.spyOn(services.musicPlayer, 'play').mockResolvedValueOnce({
        type: 'TRACK',
        track: {
          title: 'Yuusha',
          author: 'YOASOBI',
          url: 'https://www.youtube.com/watch?v=mock-yuusha',
          duration: 195,
        } as any,
        tracksAdded: 1,
        position: 0,
      });

      mockProvider.responseToolCalls = [
        {
          id: 'call-music-2',
          name: 'music.play',
          arguments: { query: 'Frieren opening song' },
        },
      ];
      mockProvider.streamTokens = [''];
      mockProvider.synthesisText = 'Yatta! I’ve queued “Yuusha” by YOASOBI for you in the music player. ✨';

      const { message, edits } = createMockMessage({
        content: 'Please play me the intro song for Frieren',
        channelId: 'channel-ai',
        voiceChannelId: 'voice-chan-100', // User is in voice channel
      });

      await controller.handleAiMessage(message);

      expect(playSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-1',
          voiceChannelId: 'voice-chan-100',
          query: 'Frieren opening song',
        }),
      );

      const synthesisReq = mockProvider.recordedRequests.find(
        (r) => !r.tools && r.messages.some((m) => m.role === 'tool'),
      );
      expect(synthesisReq).toBeDefined();
      const toolMessage = synthesisReq?.messages.find((m) => m.role === 'tool');
      expect(toolMessage).toBeDefined();
      const toolResult = JSON.parse(toolMessage?.content || '{}');
      expect(toolResult.action).toBe('queued');
      expect(toolResult.trackTitle).toBe('Yuusha');
      expect(toolResult.trackUrl).toBe('https://www.youtube.com/watch?v=mock-yuusha');
      expect(edits[edits.length - 1]).toBe('Yatta! I’ve queued “Yuusha” by YOASOBI for you in the music player. ✨');
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
