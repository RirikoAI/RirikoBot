import type {
  AiRepository,
  AiConversation,
  AiMessage,
  AiUserPreferences,
  AiGuildPreferences,
  NewAiUserPreferences,
  NewAiGuildPreferences,
} from '@ririko/database';
import type {
  ChatMessage,
  ChatRole,
  ToolCall,
  UserContext,
} from '../types/index.js';

export interface ConversationManagerOptions {
  repository: AiRepository;
  defaultWindowSize?: number;
}

export class ConversationManager {
  private readonly repository: AiRepository;
  private readonly defaultWindowSize: number;

  constructor(options: ConversationManagerOptions) {
    this.repository = options.repository;
    this.defaultWindowSize = options.defaultWindowSize ?? 20;
  }

  /**
   * Retrieves or creates an isolated conversation for the given user, guild, and channel context.
   */
  async getOrCreateConversation(
    userContext: UserContext,
    options?: { provider?: string; model?: string },
  ): Promise<AiConversation> {
    return this.repository.getOrCreateConversation({
      userId: userContext.userId,
      guildId: userContext.guildId ?? null,
      channelId: userContext.channelId ?? null,
      ...(options?.provider ? { provider: options.provider } : {}),
      ...(options?.model ? { model: options.model } : {}),
    });
  }

  /**
   * Gets the sliding window of historical messages for a user's isolated context,
   * formatted as standard domain ChatMessage objects.
   */
  async getContextMessages(
    userContext: UserContext,
    windowSize?: number,
  ): Promise<ChatMessage[]> {
    const limit = windowSize ?? this.defaultWindowSize;
    const conv = await this.repository.findConversationByUserContext({
      userId: userContext.userId,
      guildId: userContext.guildId ?? null,
      channelId: userContext.channelId ?? null,
    });

    if (!conv) {
      return [];
    }

    const messages = await this.repository.getSlidingWindowMessages(conv.id, limit);
    return messages.map((msg) => this.toChatMessage(msg));
  }

  /**
   * Appends a message to the user's isolated conversation context.
   */
  async addMessage(
    userContext: UserContext,
    message: {
      role: ChatRole;
      content: string;
      toolCalls?: ToolCall[] | undefined;
      tokenCount?: number | undefined;
    },
    conversationOptions?: { provider?: string; model?: string },
  ): Promise<AiMessage> {
    const conv = await this.getOrCreateConversation(userContext, conversationOptions);

    const toolCallsPayload = message.toolCalls
      ? (message.toolCalls as unknown as Record<string, unknown>[])
      : null;

    let now = Date.now();
    if (now <= this.lastTurnTimestamp) {
      now = this.lastTurnTimestamp + 10;
    }
    this.lastTurnTimestamp = now;

    return this.repository.addMessage({
      conversationId: conv.id,
      role: message.role.toUpperCase(),
      content: message.content,
      toolCalls: toolCallsPayload,
      tokenCount: message.tokenCount ?? 0,
      createdAt: new Date(now),
    });
  }

  private lastTurnTimestamp = 0;

  private getMonotonicTimestamps(): { userTime: Date; assistantTime: Date } {
    let now = Date.now();
    if (now <= this.lastTurnTimestamp) {
      now = this.lastTurnTimestamp + 20;
    }
    this.lastTurnTimestamp = now + 10;
    return {
      userTime: new Date(now),
      assistantTime: new Date(now + 10),
    };
  }

  /**
   * Records a complete user-assistant conversational turn in the user's isolated context.
   */
  async recordTurn(
    userContext: UserContext,
    userContent: string,
    assistantResponse: string,
    options?: {
      toolCalls?: ToolCall[] | undefined;
      provider?: string | undefined;
      model?: string | undefined;
    },
  ): Promise<{ userMessage: AiMessage; assistantMessage: AiMessage }> {
    const conv = await this.getOrCreateConversation(userContext, {
      ...(options?.provider ? { provider: options.provider } : {}),
      ...(options?.model ? { model: options.model } : {}),
    });

    const { userTime, assistantTime } = this.getMonotonicTimestamps();

    const userMessage = await this.repository.addMessage({
      conversationId: conv.id,
      role: 'USER',
      content: userContent,
      toolCalls: null,
      tokenCount: 0,
      createdAt: userTime,
    });

    const toolCallsPayload = options?.toolCalls
      ? (options.toolCalls as unknown as Record<string, unknown>[])
      : null;

    const assistantMessage = await this.repository.addMessage({
      conversationId: conv.id,
      role: 'ASSISTANT',
      content: assistantResponse,
      toolCalls: toolCallsPayload,
      tokenCount: 0,
      createdAt: assistantTime,
    });

    return { userMessage, assistantMessage };
  }

  /**
   * Clears the conversational memory for the specified user context.
   */
  async clearMemory(userContext: UserContext): Promise<boolean> {
    return this.repository.clearUserContext({
      userId: userContext.userId,
      guildId: userContext.guildId ?? null,
      channelId: userContext.channelId ?? null,
    });
  }

  /**
   * Retrieves preferences for a user (timezone, nickname, language).
   */
  async getUserPreferences(userId: string): Promise<AiUserPreferences | null> {
    return this.repository.getUserPreferences(userId);
  }

  /**
   * Updates or creates preferences for a user.
   */
  async setUserPreferences(
    userId: string,
    data: Partial<NewAiUserPreferences>,
  ): Promise<AiUserPreferences> {
    return this.repository.upsertUserPreferences(userId, data);
  }

  /**
   * Retrieves preferences for a guild (personality, allowed tools, etc.).
   */
  async getGuildPreferences(guildId: string): Promise<AiGuildPreferences | null> {
    return this.repository.getGuildPreferences(guildId);
  }

  /**
   * Updates or creates preferences for a guild.
   */
  async setGuildPreferences(
    guildId: string,
    data: Partial<NewAiGuildPreferences>,
  ): Promise<AiGuildPreferences> {
    return this.repository.upsertGuildPreferences(guildId, data);
  }

  /**
   * Helper to convert an AiMessage database record into a domain ChatMessage.
   */
  private toChatMessage(msg: AiMessage): ChatMessage {
    const roleMap: Record<string, ChatRole> = {
      USER: 'user',
      ASSISTANT: 'assistant',
      SYSTEM: 'system',
      TOOL: 'tool',
      user: 'user',
      assistant: 'assistant',
      system: 'system',
      tool: 'tool',
    };

    const role = roleMap[msg.role] ?? 'user';

    let toolCalls: ToolCall[] | undefined;
    if (msg.toolCalls) {
      if (typeof msg.toolCalls === 'string') {
        try {
          toolCalls = JSON.parse(msg.toolCalls) as ToolCall[];
        } catch {
          toolCalls = undefined;
        }
      } else if (Array.isArray(msg.toolCalls)) {
        toolCalls = msg.toolCalls as unknown as ToolCall[];
      }
    }

    return {
      role,
      content: msg.content,
      ...(toolCalls ? { toolCalls } : {}),
    };
  }
}
