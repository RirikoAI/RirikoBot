import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseClient, type SqliteDatabaseClient } from '@ririko/database';
import type { CommandContext } from '@ririko/discord';
import { PermissionFlagsBits, type User, type Guild, type GuildMember, type TextBasedChannel, type Client, type Message, type Channel } from 'discord.js';
import { createBotServices, type BotServices } from '../../services.js';
import { AiChatController } from '../../controllers/ai-chat.controller.js';
import { createAiCommands } from './commands.js';
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
  readonly supportedModels = ['gemini-2.5-flash', 'gpt-4o-mini', 'mock-model'];
  readonly defaultModel = 'mock-model';

  public responseText = 'Hello from Ririko AI assistant!';
  public responseToolCalls?: ToolCall[];
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

    yield {
      text: this.responseText,
      isFinished: true,
      toolCalls: request.tools ? this.responseToolCalls : undefined,
    };
  }
}

function createMockContext(params: {
  userId?: string;
  username?: string;
  guildId?: string | null;
  optionsMap?: Record<string, unknown>;
  replyFn?: (res: unknown) => Promise<unknown>;
  editReplyFn?: (res: unknown) => Promise<unknown>;
  rawArgs?: string[];
  permissions?: bigint;
  source?: 'slash' | 'prefix';
}): { ctx: CommandContext; replies: unknown[]; edits: unknown[] } {
  const replies: unknown[] = [];
  const edits: unknown[] = [];

  const user = {
    id: params.userId ?? 'user-alice',
    username: params.username ?? 'Alice',
  } as User;

  const guild = params.guildId !== null
    ? ({ id: params.guildId ?? 'guild-test', name: 'Test Guild', members: { me: { permissions: { bitfield: 3145728n } } } } as unknown as Guild)
    : null;

  const member = guild
    ? ({
        displayName: 'Alice In Wonderland',
        permissions: {
          has: (perm: bigint) => ((params.permissions ?? PermissionFlagsBits.Administrator) & perm) !== 0n,
          bitfield: params.permissions ?? PermissionFlagsBits.Administrator,
        },
        roles: { highest: { position: 10 } },
        joinedAt: new Date('2025-01-01'),
      } as unknown as GuildMember)
    : null;

  const optionsMap = params.optionsMap ?? {};
  const reply = (params.replyFn ?? vi.fn(async (res: unknown) => {
    replies.push(res);
    return {} as Message;
  })) as unknown as CommandContext['reply'];

  const editReply = (params.editReplyFn ?? vi.fn(async (res: unknown) => {
    edits.push(res);
    return {} as Message;
  })) as unknown as CommandContext['editReply'];

  const ctx: CommandContext = {
    source: params.source ?? 'slash',
    id: 'ctx-mock-ai-1',
    client: {} as Client,
    guild,
    guildId: guild?.id ?? null,
    channel: {
      id: 'channel-test-1',
      send: vi.fn().mockResolvedValue({} as unknown as Message),
    } as unknown as TextBasedChannel,
    channelId: 'channel-test-1',
    member,
    user,
    commandName: 'ai',
    invokedPrefix: params.source === 'prefix' ? '!' : '/',
    isReplied: false,
    isDeferred: false,
    raw: {} as unknown as Message,
    options: {
      getString: (name: string) => (optionsMap[name] as string | undefined) ?? null,
      getInteger: (name: string) => (optionsMap[name] as number | undefined) ?? null,
      getNumber: (name: string) => (optionsMap[name] as number | undefined) ?? null,
      getBoolean: (name: string) => (optionsMap[name] as boolean | undefined) ?? null,
      getUser: async (name: string) => (optionsMap[name] as User | undefined) ?? null,
      getMember: async () => member,
      getChannel: async (name: string) => (optionsMap[name] as Channel | undefined) ?? null,
      getAttachment: () => null,
      getRawArgs: () => params.rawArgs ?? [],
    },
    reply,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply,
    followUp: vi.fn().mockResolvedValue({} as unknown as Message),
    send: vi.fn().mockResolvedValue({} as unknown as Message),
  };

  return { ctx, replies, edits };
}

describe('AI Commands Suite & Dual-Dispatch Handlers (TASK-0632)', () => {
  let dbClient: SqliteDatabaseClient;
  let services: BotServices;
  let mockProvider: MockAiProvider;
  let aiController: AiChatController;
  let commands: Map<string, (ctx: CommandContext) => Promise<void>>;

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
        language_preference TEXT NOT NULL DEFAULT 'en',
        preferred_model TEXT
      );
    `);

    services = await createBotServices(dbClient);
    mockProvider = new MockAiProvider();
    services.fallbackChainManager.registerProvider(mockProvider);

    const mockClient = {
      user: { id: 'bot-ririko-999' },
    } as unknown as Client;

    aiController = new AiChatController(mockClient, services);
    const cmdList = createAiCommands(services, aiController);
    commands = new Map(cmdList.map((c) => [c.metadata.name, c.execute]));
  });

  describe('1. Unified /ai clear & Standalone /aiclear', () => {
    it('clears conversational memory via /ai action:clear', async () => {
      // Seed a turn in conversation
      await services.conversationManager.recordTurn(
        { userId: 'user-alice', guildId: 'guild-test', channelId: 'channel-test-1' },
        'Hello Ririko!',
        'Hello Alice!',
      );

      const beforeMsgs = await services.conversationManager.getContextMessages(
        { userId: 'user-alice', guildId: 'guild-test', channelId: 'channel-test-1' },
        10,
      );
      expect(beforeMsgs).toHaveLength(2);

      const { ctx, replies } = createMockContext({
        optionsMap: { action: 'clear' },
      });

      await commands.get('ai')!(ctx);

      expect(replies[0]).toEqual(
        expect.objectContaining({
          content: expect.stringContaining('Ririko AI Memory Cleared'),
        }),
      );

      const afterMsgs = await services.conversationManager.getContextMessages(
        { userId: 'user-alice', guildId: 'guild-test', channelId: 'channel-test-1' },
        10,
      );
      expect(afterMsgs).toHaveLength(0);
    });

    it('clears conversational memory via standalone /aiclear command and prefix !ai clear', async () => {
      await services.conversationManager.recordTurn(
        { userId: 'user-bob', guildId: 'guild-test', channelId: 'channel-test-1' },
        'Favorite game?',
        'Steins;Gate!',
      );

      // Test standalone /aiclear
      const { ctx: clearCtx, replies: clearReplies } = createMockContext({
        userId: 'user-bob',
      });
      await commands.get('aiclear')!(clearCtx);
      expect(clearReplies[0]).toEqual(
        expect.objectContaining({
          content: expect.stringContaining('Ririko AI Memory Cleared'),
        }),
      );

      // Test prefix !ai clear
      const { ctx: prefixCtx, replies: prefixReplies } = createMockContext({
        userId: 'user-bob',
        source: 'prefix',
        rawArgs: ['clear'],
      });
      await commands.get('ai')!(prefixCtx);
      expect(prefixReplies[0]).toEqual(
        expect.objectContaining({
          content: expect.stringContaining('Ririko AI Memory Cleared'),
        }),
      );
    });
  });

  describe('2. Dedicated #ririko-ai Channel Setup (/ai channel & /aichannel)', () => {
    it('sets dedicated channel when user has ManageGuild permission', async () => {
      const targetChannel = { id: 'channel-ai-dedicated' } as unknown as Channel;
      const { ctx, replies } = createMockContext({
        optionsMap: { action: 'channel', channel: targetChannel },
        permissions: PermissionFlagsBits.ManageGuild,
      });

      await commands.get('ai')!(ctx);
      expect(replies[0]).toEqual(
        expect.objectContaining({
          content: expect.stringContaining('configured as the dedicated **#ririko-ai** channel'),
        }),
      );

      const dedicated = await services.conversationManager.getDedicatedChannel('guild-test');
      expect(dedicated).toBe('channel-ai-dedicated');
    });

    it('denies configuring channel when user lacks permissions', async () => {
      const targetChannel = { id: 'channel-ai-dedicated' } as unknown as Channel;
      const { ctx, replies } = createMockContext({
        optionsMap: { action: 'channel', channel: targetChannel },
        permissions: 0n, // No permissions
      });

      await commands.get('ai')!(ctx);
      expect(replies[0]).toEqual(
        expect.objectContaining({
          content: expect.stringContaining('Manage Server'),
        }),
      );

      const dedicated = await services.conversationManager.getDedicatedChannel('guild-test');
      expect(dedicated).toBeNull();
    });

    it('unsets dedicated channel when reset argument is passed', async () => {
      await services.conversationManager.setDedicatedChannel('guild-test', 'channel-ai-dedicated');

      const { ctx, replies } = createMockContext({
        optionsMap: { action: 'channel' },
        rawArgs: ['channel', 'reset'],
        permissions: PermissionFlagsBits.ManageChannels,
      });

      await commands.get('ai')!(ctx);
      expect(replies[0]).toEqual(
        expect.objectContaining({
          content: expect.stringContaining('Dedicated AI channel has been unset'),
        }),
      );

      const dedicated = await services.conversationManager.getDedicatedChannel('guild-test');
      expect(dedicated).toBeNull();
    });
  });

  describe('3. Guild Persona Configuration (/ai persona & /aipersona)', () => {
    it('updates guild speaking style and custom prompt with ManageGuild permission', async () => {
      const { ctx, replies } = createMockContext({
        optionsMap: {
          action: 'persona',
          style: 'TSUNDERE',
          prompt: 'Act tsundere but helpful with anime questions.',
        },
        permissions: PermissionFlagsBits.ManageGuild,
      });

      await commands.get('ai')!(ctx);
      expect(replies[0]).toEqual(
        expect.objectContaining({
          content: expect.stringContaining('Ririko AI Persona Updated'),
        }),
      );

      const prefs = await services.conversationManager.getGuildPreferences('guild-test');
      expect(prefs?.speakingStyle).toBe('TSUNDERE');
      expect(prefs?.personalityPrompt).toBe('Act tsundere but helpful with anime questions.');
    });

    it('displays current persona settings when no options provided', async () => {
      await services.conversationManager.setGuildPreferences('guild-test', {
        speakingStyle: 'KUUDERE',
      });

      const { ctx, replies } = createMockContext({
        optionsMap: { action: 'persona' },
      });

      await commands.get('ai')!(ctx);
      expect(replies[0]).toHaveProperty('embeds');
    });
  });

  describe('4. Model Selection & Inspection (/ai model & /aimodel)', () => {
    it('saves server model preference', async () => {
      const { ctx, replies } = createMockContext({
        optionsMap: { action: 'model', model: 'gemini-2.5-flash' },
      });

      await commands.get('ai')!(ctx);
      expect(replies[0]).toEqual(
        expect.objectContaining({
          content: expect.stringContaining('gemini-2.5-flash'),
        }),
      );

      const guildPrefs = await services.conversationManager.getGuildPreferences('guild-test');
      expect(guildPrefs?.modelOverride).toBe('gemini-2.5-flash');
    });

    it('lists available models and active providers when no model option given', async () => {
      const { ctx, replies } = createMockContext({
        optionsMap: { action: 'model' },
      });

      await commands.get('ai')!(ctx);
      expect(replies[0]).toHaveProperty('embeds');
    });
  });

  describe('5. Chat Turn Execution & Tool Calling (/ai chat, /chat, !ai prompt)', () => {
    it('generates response, records conversational turn, and edits reply', async () => {
      mockProvider.responseText = 'The speed of light in vacuum is approximately 299,792,458 m/s.';

      const { ctx, edits } = createMockContext({
        optionsMap: { action: 'chat', prompt: 'What is the speed of light?' },
      });

      await commands.get('ai')!(ctx);

      expect(ctx.deferReply).toHaveBeenCalled();
      expect(edits[0]).toEqual(
        expect.objectContaining({
          content: expect.stringContaining('299,792,458 m/s'),
        }),
      );

      // Verify conversation turn was persisted with per-user isolation
      const msgs = await services.conversationManager.getContextMessages(
        { userId: 'user-alice', guildId: 'guild-test', channelId: 'channel-test-1' },
        10,
      );
      expect(msgs).toHaveLength(2);
      expect(msgs[0]!.content).toBe('What is the speed of light?');
      expect(msgs[1]!.content).toContain('299,792,458 m/s');
    });

    it('executes tool call when emitted and synthesizes conversational response', async () => {
      mockProvider.responseText = 'Checking the clock for you!';
      mockProvider.responseToolCalls = [
        {
          id: 'call-clock-1',
          name: 'get_current_time',
          arguments: { timezone: 'UTC' },
        },
      ];
      mockProvider.synthesisText = 'The time in UTC is 8:44 AM!';

      const { ctx, edits } = createMockContext({
        source: 'prefix',
        rawArgs: ['What time is it in UTC?'],
      });

      await commands.get('ai')!(ctx);

      expect(edits[0]).toEqual(
        expect.objectContaining({
          content: 'The time in UTC is 8:44 AM!',
        }),
      );

      // Verify tool response message was sent to synthesis turn
      const synthesisReq = mockProvider.recordedRequests.find(
        (r) => !r.tools && r.messages.some((m) => m.role === 'tool'),
      );
      expect(synthesisReq).toBeDefined();
      expect(synthesisReq?.messages.some((m) => m.role === 'tool' && m.toolCallId === 'call-clock-1')).toBe(true);
    });

    it('falls back to clean formatted markdown when slash tool synthesis fails', async () => {
      mockProvider.responseText = 'Checking the clock for you!';
      mockProvider.responseToolCalls = [
        {
          id: 'call-clock-1',
          name: 'get_current_time',
          arguments: { timezone: 'UTC' },
        },
      ];
      mockProvider.synthesisText = '';

      const { ctx, edits } = createMockContext({
        source: 'prefix',
        rawArgs: ['What time is it in UTC?'],
      });

      await commands.get('ai')!(ctx);

      expect(edits[0]).toEqual(
        expect.objectContaining({
          content: expect.stringContaining('🕒 **Current Time**:'),
        }),
      );
    });

    it('executes direct /chat command', async () => {
      mockProvider.responseText = 'Gundam Unicorn is an incredible series!';

      const { ctx, edits } = createMockContext({
        optionsMap: { prompt: 'Do you recommend Gundam Unicorn?' },
      });

      await commands.get('chat')!(ctx);

      expect(edits[0]).toEqual(
        expect.objectContaining({
          content: expect.stringContaining('Gundam Unicorn'),
        }),
      );
    });
  });
});
