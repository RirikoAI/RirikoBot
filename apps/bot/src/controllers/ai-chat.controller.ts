import type { Client, Message, GuildMember } from 'discord.js';
import type { BotServices } from '../services.js';
import type { MusicEmbedController } from './music-embed.controller.js';
import type {
  ChatMessage,
  ChatRequest,
  ToolCall,
  UserContext,
  ToolExecutionContext,
  SecurityExecutionContext,
} from '@ririko/ai';
import { formatToolResultFallback } from '@ririko/ai';
import { DEFAULT_COMMAND_PREFIX } from '@ririko/discord';

export interface AiChatControllerOptions {
  minEditIntervalMs?: number;
  defaultPrefix?: string;
  musicController?: MusicEmbedController;
}

export class AiChatController {
  private readonly client: Client;
  private readonly services: BotServices;
  private readonly minEditIntervalMs: number;
  private readonly defaultPrefix: string;
  public readonly musicController: MusicEmbedController | undefined;
  private readonly channelCache = new Map<string, { channelId: string | null; cachedAt: number }>();
  private readonly CACHE_TTL_MS = 60_000; // 1 minute cache for dedicated channel lookups

  constructor(client: Client, services: BotServices, options: AiChatControllerOptions = {}) {
    this.client = client;
    this.services = services;
    this.minEditIntervalMs = options.minEditIntervalMs ?? 1500;
    this.defaultPrefix =
      options.defaultPrefix || process.env.DEFAULT_PREFIX || DEFAULT_COMMAND_PREFIX;
    this.musicController = options.musicController;
  }

  /**
   * Resolves the active command prefix for a guild, falling back to defaultPrefix.
   */
  async getPrefix(guildId?: string | null): Promise<string> {
    if (guildId) {
      const settings = await this.services.guildSettingsRepo.findById(guildId).catch(() => null);
      if (settings?.prefix) {
        return settings.prefix;
      }
    }
    return this.defaultPrefix;
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
   * Completely ignores any message that begins with the configured command prefix ($ or !).
   */
  async handleAiMessage(message: Message): Promise<boolean> {
    // Ignore bots and direct messages
    if (message.author.bot || !message.guild) {
      return false;
    }

    const guildId = message.guild.id;
    const channelId = message.channelId;
    const botId = this.client.user?.id;

    // Check if the message is a prefix command (e.g. $balance, !help).
    // If so, let CommandRouter handle it exclusively and ignore in AI chat.
    const prefix = await this.getPrefix(guildId);
    const content = message.content.trim();
    if (prefix && content.startsWith(prefix)) {
      return false;
    }
    if (this.defaultPrefix && content.startsWith(this.defaultPrefix)) {
      return false;
    }
    if (content.startsWith('!')) {
      return false;
    }

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

    // If message after bot mention still starts with command prefix, ignore it
    if (prefix && prompt.startsWith(prefix)) {
      return false;
    }
    if (this.defaultPrefix && prompt.startsWith(this.defaultPrefix)) {
      return false;
    }
    if (prompt.startsWith('!')) {
      return false;
    }

    // If empty mention, provide a friendly greeting
    if (!prompt) {
      if ('reply' in message) {
        await message
          .reply({
            content: 'Konnichiwa! I am Ririko! Ask me anything or chat with me here! ✨',
          })
          .catch(() => {});
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
          const truncated =
            displayedText.length > 2000 ? `${displayedText.slice(0, 1990)}...` : displayedText;
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
      const messages: ChatMessage[] = [...history, { role: 'user', content: prompt }];

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
      let streamSucceeded = false;
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
          if (accumulatedContent || accumulatedToolCalls.length > 0) {
            streamSucceeded = true;
          }
        } catch {
          accumulatedContent = '';
          accumulatedToolCalls.length = 0;
        }
      }

      // If streaming produced neither text nor tool calls, use standard generate
      if (!streamSucceeded) {
        const response = await this.services.fallbackChainManager.generate(chatRequest);
        accumulatedContent = response.content;
        if (response.toolCalls && response.toolCalls.length > 0) {
          accumulatedToolCalls.push(...response.toolCalls);
        }
      }

      // Deduplicate tool calls if any
      const uniqueToolCalls: ToolCall[] = [];
      const seenCallKeys = new Set<string>();
      for (const tc of accumulatedToolCalls) {
        const key = tc.id || `${tc.name}:${JSON.stringify(tc.arguments)}`;
        if (!seenCallKeys.has(key)) {
          seenCallKeys.add(key);
          uniqueToolCalls.push(tc);
        }
      }

      // 10. Mediate Tool Calls if emitted
      if (uniqueToolCalls.length > 0) {
        const toolNames = uniqueToolCalls.map((t) => t.name).join(', ');
        displayedText = `🔧 *Using ${toolNames}...*`;
        await flushEdit(displayedText, true);

        let member = message.member as GuildMember | null;
        if (!member && message.guild) {
          member = await message.guild.members.fetch(message.author.id).catch(() => null);
        }
        const voiceChannel = member?.voice?.channel;
        const voiceChannelPerms =
          voiceChannel && member ? voiceChannel.permissionsFor(member)?.bitfield : undefined;
        const userPermissions = voiceChannelPerms ?? member?.permissions?.bitfield;

        const botMember =
          message.guild?.members?.me ??
          (message.guild ? await message.guild.members.fetchMe().catch(() => null) : null);
        const botVoicePerms =
          voiceChannel && botMember ? voiceChannel.permissionsFor(botMember)?.bitfield : undefined;
        const botPermissions = botVoicePerms ?? botMember?.permissions?.bitfield;

        const toolContext: SecurityExecutionContext & ToolExecutionContext = {
          userId,
          guildId,
          channelId,
          userTimezone: userPrefs?.timezone,
          guildTimezone: guildSettings?.timezone,
          userPermissions,
          botPermissions,
          userHighestRolePosition: member?.roles?.highest?.position,
          botHighestRolePosition: botMember?.roles?.highest?.position,
          allowedTools,
          getBalance: async (targetId: string) => {
            const bal = await this.services.economyRepo.findById(targetId);
            return bal
              ? { wallet: bal.walletBalance, bank: bal.bankBalance, netWorth: bal.netWorth }
              : null;
          },
          playMusic: async (query: string) => {
            if (!message.guild) {
              return {
                success: false,
                message: 'Music playback is only available in Discord servers.',
              };
            }

            const voiceChannelId =
              member?.voice?.channelId ??
              message.guild.voiceStates?.cache?.get(message.author.id)?.channelId;
            if (!voiceChannelId) {
              return {
                success: false,
                message:
                  'You need to be connected to a voice channel so I know where to play music! Please join a voice channel and ask me again! 🎵',
              };
            }

            try {
              const result = await this.services.musicPlayer.play({
                guildId: message.guild.id,
                voiceChannelId,
                textChannelId: message.channelId,
                member: {
                  id: message.author.id,
                  username: message.author.username,
                  avatarUrl: message.author.displayAvatarURL
                    ? message.author.displayAvatarURL()
                    : undefined,
                },
                query,
                adapterCreator: message.guild.voiceAdapterCreator,
              });

              if (result.type === 'PLAYLIST' && result.playlist) {
                void this.musicController?.updateController(message.guild.id);
                return {
                  success: true,
                  message: `Successfully queued playlist "${result.playlist.title}" with ${result.tracksAdded} tracks into the music player! (Position: ${result.position === 0 ? 'Now playing' : '#' + result.position})`,
                  trackTitle: result.playlist.title,
                  trackUrl: result.playlist.url,
                  position: result.position,
                };
              } else if (result.track) {
                void this.musicController?.updateController(message.guild.id);
                return {
                  success: true,
                  message: `Successfully queued "${result.track.title}" by ${result.track.artist || 'Unknown'} into the music player! (Position: ${result.position === 0 ? 'Now playing' : '#' + result.position})`,
                  trackTitle: result.track.title,
                  trackUrl: result.track.url,
                  position: result.position,
                };
              } else {
                return {
                  success: false,
                  message: `Could not find any playable tracks for "${query}".`,
                };
              }
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              return {
                success: false,
                message: `Failed to play music: ${errorMsg}`,
              };
            }
          },
        };

        const toolResponses = await this.services.toolExecutor.executeBatch(
          uniqueToolCalls,
          toolContext,
        );

        // Follow up with LLM to synthesize natural in-character conversational response
        const synthesisMessages: ChatMessage[] = [
          ...chatRequest.messages,
          {
            role: 'assistant',
            content: accumulatedContent || '',
            toolCalls: uniqueToolCalls,
          },
          ...toolResponses.map((tr) => ({
            role: 'tool' as const,
            toolCallId: tr.toolCallId,
            name: tr.name,
            content: tr.success
              ? typeof tr.result === 'string'
                ? tr.result
                : JSON.stringify(tr.result)
              : JSON.stringify({ error: tr.error ?? 'Execution failed' }),
          })),
        ];

        const synthesisRequest: ChatRequest = {
          ...chatRequest,
          messages: synthesisMessages,
          tools: undefined, // Disallow further tools to force final response synthesis
        };

        let synthesizedText = '';
        try {
          if (canStream) {
            try {
              const synthStream = this.services.fallbackChainManager.stream(synthesisRequest);
              for await (const token of synthStream) {
                if (token.text) {
                  synthesizedText += token.text;
                  displayedText = synthesizedText;
                  await flushEdit(synthesizedText, false);
                }
              }
            } catch {
              synthesizedText = '';
            }
          }

          if (!synthesizedText) {
            const synthResponse =
              await this.services.fallbackChainManager.generate(synthesisRequest);
            synthesizedText = synthResponse.content;
          }
        } catch (err) {
          console.warn(
            '[AiChatController] LLM synthesis from tool result failed, using formatted fallback:',
            err,
          );
        }

        if (synthesizedText) {
          accumulatedContent = synthesizedText;
        } else {
          // Graceful fallback: clean, human-readable tool summary
          accumulatedContent = formatToolResultFallback(toolResponses);
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
      await this.services.conversationManager
        .recordTurn(
          userContext,
          prompt,
          accumulatedContent,
          uniqueToolCalls.length > 0 ? { toolCalls: uniqueToolCalls } : undefined,
        )
        .catch((err) => {
          console.error('[AiChatController] Failed to record conversation turn:', err);
        });
    } catch (err) {
      console.error('[AiChatController] Error processing AI chat message:', err);
      if (replyMessage) {
        await replyMessage
          .edit({
            content:
              'Sorry, I encountered an error while processing your request. Please try again!',
          })
          .catch(() => {});
      }
    } finally {
      clearInterval(typingInterval);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
      }
    }
  }
}
