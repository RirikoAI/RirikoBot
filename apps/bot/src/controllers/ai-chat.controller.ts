import type { Client, Message } from 'discord.js';
import type { BotServices } from '../services.js';
import type {
  ChatMessage,
  ChatRequest,
  ToolCall,
  UserContext,
  ToolExecutionContext,
  SecurityExecutionContext,
} from '@ririko/ai';

export interface AiChatControllerOptions {
  minEditIntervalMs?: number;
}

export class AiChatController {
  private readonly client: Client;
  private readonly services: BotServices;
  private readonly minEditIntervalMs: number;
  private readonly channelCache = new Map<string, { channelId: string | null; cachedAt: number }>();
  private readonly CACHE_TTL_MS = 60_000; // 1 minute cache for dedicated channel lookups

  constructor(client: Client, services: BotServices, options: AiChatControllerOptions = {}) {
    this.client = client;
    this.services = services;
    this.minEditIntervalMs = options.minEditIntervalMs ?? 1500;
  }

  /**
   * Retrieves the dedicated AI channel ID for a guild with in-memory TTL caching.
   */
  async getDedicatedChannelId(guildId: string): Promise<string | null> {
    const cached = this.channelCache.get(guildId);
    const now = Date.now();
    if (cached && now - cached.cachedAt < this.CACHE_TTL_MS) {
      return cached.channelId;
    }

    const channelId = await this.services.aiRepo.getAiChannel(guildId).catch(() => null);
    this.channelCache.set(guildId, { channelId, cachedAt: now });
    return channelId;
  }

  /**
   * Clears the cached dedicated channel ID when updated via /ai channel commands.
   */
  invalidateChannelCache(guildId: string): void {
    this.channelCache.delete(guildId);
  }

  /**
   * Evaluates incoming message and handles it if sent in dedicated #ririko-ai channel
   * or mentions the bot. Returns true if handled.
   */
  async handleAiMessage(message: Message): Promise<boolean> {
    // Ignore bots and direct messages
    if (message.author.bot || !message.guild) {
      return false;
    }

    const guildId = message.guild.id;
    const channelId = message.channelId;
    const botId = this.client.user?.id;

    const dedicatedChannelId = await this.getDedicatedChannelId(guildId);
    const isDedicatedChannel = dedicatedChannelId === channelId;
    const isMentioned = botId ? message.mentions.has(botId) : false;

    // Only process if in dedicated channel or explicitly mentioned
    if (!isDedicatedChannel && !isMentioned) {
      return false;
    }

    // Clean user prompt
    let prompt = message.content;
    if (botId) {
      prompt = prompt.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
    }

    // If empty mention, provide a friendly greeting
    if (!prompt) {
      if ('reply' in message) {
        await message.reply({
          content: 'Konnichiwa! I am Ririko! Ask me anything or chat with me here! ✨',
        }).catch(() => {});
      }
      return true;
    }

    // Process chat invocation
    await this.processChat(message, prompt);
    return true;
  }

  /**
   * Core AI execution pipeline: typing indicator, context assembly, multi-provider
   * streaming with debounced edits (max 1 edit/1.5s), and mediated tool execution.
   */
  private async processChat(message: Message, prompt: string): Promise<void> {
    const userId = message.author.id;
    const guildId = message.guild!.id;
    const channelId = message.channelId;

    // 1. Maintain periodic typing indicator
    const sendTypingSafe = async () => {
      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping().catch(() => {});
      }
    };
    await sendTypingSafe();
    const typingInterval = setInterval(sendTypingSafe, 4000);

    let replyMessage: Message | null = null;
    let pendingTimer: NodeJS.Timeout | null = null;
    let lastEditTime = 0;
    let displayedText = '';

    const flushEdit = async (text: string, force = false): Promise<void> => {
      const now = Date.now();
      const elapsed = now - lastEditTime;

      if (!replyMessage) return;

      if (force || elapsed >= this.minEditIntervalMs) {
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
        }
        lastEditTime = now;
        displayedText = text;
        const truncated = text.length > 2000 ? `${text.slice(0, 1990)}...` : text;
        await replyMessage.edit({ content: truncated || '...' }).catch(() => {});
      } else if (!pendingTimer) {
        pendingTimer = setTimeout(async () => {
          pendingTimer = null;
          lastEditTime = Date.now();
          const truncated = displayedText.length > 2000 ? `${displayedText.slice(0, 1990)}...` : displayedText;
          await replyMessage?.edit({ content: truncated || '...' }).catch(() => {});
        }, this.minEditIntervalMs - elapsed);
      }
    };

    try {
      // 2. Assemble User Context
      const userContext: UserContext = {
        userId,
        guildId,
        channelId,
        username: message.author.username,
        displayName: message.author.displayName ?? message.author.username,
      };

      // 3. Retrieve Preferences
      const [userPrefs, guildPrefs, guildSettings] = await Promise.all([
        this.services.conversationManager.getUserPreferences(userId).catch(() => null),
        this.services.conversationManager.getGuildPreferences(guildId).catch(() => null),
        this.services.guildSettingsRepo.findById(guildId).catch(() => null),
      ]);

      // 4. Assemble System Instructions
      const systemInstruction = this.services.personalityEngine.assembleSystemPrompt({
        speakingStyle: guildPrefs?.speakingStyle,
        customGuildPrompt: guildPrefs?.personalityPrompt,
        identity: {
          username: message.author.username,
          displayName: message.author.displayName ?? message.author.username,
          guildName: message.guild?.name,
          joinedDate: message.member?.joinedAt?.toISOString().slice(0, 10),
        },
        userTimezone: userPrefs?.timezone || guildSettings?.timezone || 'UTC',
      });

      // 5. Retrieve Sliding Window History
      const history = await this.services.conversationManager.getContextMessages(userContext, 20);

      // 6. Tool Definitions & Allowlist
      const allowedTools =
        guildPrefs?.allowedTools && guildPrefs.allowedTools.length > 0
          ? guildPrefs.allowedTools
          : undefined;
      const toolDefs = this.services.toolRegistry.getDefinitions(allowedTools);

      // 7. Construct ChatRequest
      const messages: ChatMessage[] = [
        ...history,
        { role: 'user', content: prompt },
      ];

      const chatRequest: ChatRequest = {
        messages,
        systemInstruction,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        userContext,
      };

      // 8. Send Initial Placeholder
      replyMessage = await message.reply({ content: '💭 *Thinking...*' }).catch(() => null);

      // 9. Execute with Fallback Chain
      let accumulatedContent = '';
      const accumulatedToolCalls: ToolCall[] = [];

      // Attempt streaming first
      const canStream = typeof this.services.fallbackChainManager.stream === 'function';
      if (canStream) {
        try {
          const stream = this.services.fallbackChainManager.stream(chatRequest);
          for await (const token of stream) {
            if (token.text) {
              accumulatedContent += token.text;
              displayedText = accumulatedContent;
              await flushEdit(accumulatedContent, false);
            }
            if (token.toolCalls && token.toolCalls.length > 0) {
              accumulatedToolCalls.push(...token.toolCalls);
            }
          }
        } catch {
          // Stream failed, will fall back to single generation
        }
      }

      // If streaming produced no text, use standard generate
      if (!accumulatedContent) {
        const response = await this.services.fallbackChainManager.generate(chatRequest);
        accumulatedContent = response.content;
        if (response.toolCalls && response.toolCalls.length > 0) {
          accumulatedToolCalls.push(...response.toolCalls);
        }
      }

      // 10. Mediate Tool Calls if emitted
      if (accumulatedToolCalls.length > 0) {
        const toolContext: SecurityExecutionContext & ToolExecutionContext = {
          userId,
          guildId,
          channelId,
          userTimezone: userPrefs?.timezone,
          guildTimezone: guildSettings?.timezone,
          userPermissions: message.member?.permissions?.bitfield,
          botPermissions: message.guild?.members?.me?.permissions?.bitfield,
          userHighestRolePosition: message.member?.roles?.highest?.position,
          botHighestRolePosition: message.guild?.members?.me?.roles?.highest?.position,
          allowedTools,
        };

        const toolResponses = await this.services.toolExecutor.executeBatch(
          accumulatedToolCalls,
          toolContext,
        );

        // Summarize tool execution for user
        const toolSummaries: string[] = [];
        for (const tr of toolResponses) {
          if (tr.success) {
            toolSummaries.push(`🔧 *[${tr.name}]*: ${JSON.stringify(tr.result)}`);
          } else {
            toolSummaries.push(`⚠️ *[${tr.name} Blocked]*: ${tr.error}`);
          }
        }

        if (toolSummaries.length > 0) {
          accumulatedContent = accumulatedContent
            ? `${accumulatedContent}\n\n${toolSummaries.join('\n')}`
            : toolSummaries.join('\n');
        }
      }

      // 11. Final Flush
      displayedText = accumulatedContent || '*(No response generated)*';
      await flushEdit(displayedText, true);

      // If text exceeds 2000 characters, send remainder in follow-up message
      if (accumulatedContent.length > 2000 && 'send' in message.channel) {
        const remainder = accumulatedContent.slice(1990);
        await message.channel.send({ content: remainder.slice(0, 2000) }).catch(() => {});
      }

      // 12. Record Turn in Isolated User Memory
      await this.services.conversationManager.recordTurn(
        userContext,
        prompt,
        accumulatedContent,
        accumulatedToolCalls.length > 0 ? { toolCalls: accumulatedToolCalls } : undefined,
      ).catch((err) => {
        console.error('[AiChatController] Failed to record conversation turn:', err);
      });
    } catch (err) {
      console.error('[AiChatController] Error processing AI chat message:', err);
      if (replyMessage) {
        await replyMessage.edit({
          content: 'Sorry, I encountered an error while processing your request. Please try again!',
        }).catch(() => {});
      }
    } finally {
      clearInterval(typingInterval);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
      }
    }
  }
}
