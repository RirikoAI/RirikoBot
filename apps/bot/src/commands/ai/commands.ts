import { PermissionFlagsBits, EmbedBuilder, type GuildMember } from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
} from '@ririko/discord';
import type {
  ChatMessage,
  ChatRequest,
  SpeakingStyle,
  ToolExecutionContext,
  SecurityExecutionContext,
  UserContext,
} from '@ririko/ai';
import { formatToolResultFallback } from '@ririko/ai';
import type { BotServices } from '../../services.js';
import type { AiChatController } from '../../controllers/ai-chat.controller.js';
import type { MusicEmbedController } from '../../controllers/music-embed.controller.js';

export const SPEAKING_STYLE_CHOICES = [
  { name: 'Friendly Anime (Default)', value: 'FRIENDLY_ANIME' },
  { name: 'Tsundere', value: 'TSUNDERE' },
  { name: 'Kuudere', value: 'KUUDERE' },
  { name: 'Dandere', value: 'DANDERE' },
  { name: 'Genki', value: 'GENKI' },
  { name: 'Formal / Professional', value: 'FORMAL' },
];

/**
 * Executes a conversational AI inference turn for the given context and user prompt.
 */
export async function executeAiChatTurn(
  ctx: CommandContext,
  services: BotServices,
  prompt: string,
  musicController?: MusicEmbedController,
): Promise<void> {
  await ctx.deferReply();

  const userId = ctx.user.id;
  const guildId = ctx.guildId ?? undefined;
  const channelId = ctx.channelId;

  const userContext: UserContext = {
    userId,
    guildId,
    channelId,
    username: ctx.user.username,
    displayName: ctx.member?.displayName ?? ctx.user.username,
  };

  try {
    // 1. Retrieve user & guild settings
    const [userPrefs, guildPrefs, guildSettings] = await Promise.all([
      services.conversationManager.getUserPreferences(userId).catch(() => null),
      guildId ? services.conversationManager.getGuildPreferences(guildId).catch(() => null) : null,
      guildId ? services.guildSettingsRepo.findById(guildId).catch(() => null) : null,
    ]);

    // 2. Assemble system prompt
    const systemInstruction = services.personalityEngine.assembleSystemPrompt({
      speakingStyle: guildPrefs?.speakingStyle,
      customGuildPrompt: guildPrefs?.personalityPrompt,
      identity: {
        username: ctx.user.username,
        displayName: ctx.member?.displayName ?? ctx.user.username,
        guildName: ctx.guild?.name,
        joinedDate: ctx.member?.joinedAt?.toISOString().slice(0, 10),
      },
      userTimezone: userPrefs?.timezone || guildSettings?.timezone || 'UTC',
    });

    // 3. Sliding window message history
    const history = await services.conversationManager.getContextMessages(userContext, 20);

    // 4. Resolve allowed tools
    const allowedTools =
      guildPrefs?.allowedTools && guildPrefs.allowedTools.length > 0
        ? guildPrefs.allowedTools
        : undefined;
    const toolDefs = services.toolRegistry.getDefinitions(allowedTools);

    // 5. Construct chat request
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

    // 6. Generate AI response
    const response = await services.fallbackChainManager.generate(chatRequest);

    let replyText = response.content.trim();
    if (!replyText && (!response.toolCalls || response.toolCalls.length === 0)) {
      replyText = '*(No response generated)*';
    }

    // 7. Mediate any tool calls emitted by the model
    if (response.toolCalls && response.toolCalls.length > 0) {
      let member = ctx.member as GuildMember | null;
      if (!member && ctx.guild) {
        member = await ctx.guild.members.fetch(ctx.user.id).catch(() => null);
      }
      const voiceChannel = member?.voice?.channel;
      const voiceChannelPerms = voiceChannel && member ? voiceChannel.permissionsFor(member)?.bitfield : undefined;
      const userPermissions = voiceChannelPerms ?? ctx.member?.permissions?.bitfield;

      const botMember = ctx.guild?.members?.me ?? (ctx.guild ? await ctx.guild.members.fetchMe().catch(() => null) : null);
      const botVoicePerms = voiceChannel && botMember ? voiceChannel.permissionsFor(botMember)?.bitfield : undefined;
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
          const bal = await services.economyRepo.findById(targetId);
          return bal
            ? { wallet: bal.walletBalance, bank: bal.bankBalance, netWorth: bal.netWorth }
            : null;
        },
        playMusic: async (query: string) => {
          if (!ctx.guild) {
            return {
              success: false,
              message: 'Music playback is only available in Discord servers.',
            };
          }

          const voiceChannelId =
            member?.voice?.channelId ??
            ctx.guild.voiceStates?.cache?.get(ctx.user.id)?.channelId;
          if (!voiceChannelId) {
            return {
              success: false,
              message: 'You need to be connected to a voice channel so I know where to play music! Please join a voice channel and ask me again! 🎵',
            };
          }

          try {
            const result = await services.musicPlayer.play({
              guildId: ctx.guild.id,
              voiceChannelId,
              textChannelId: ctx.channelId,
              member: {
                id: ctx.user.id,
                username: ctx.user.username,
                avatarUrl: ctx.user.displayAvatarURL ? ctx.user.displayAvatarURL() : undefined,
              },
              query,
              adapterCreator: ctx.guild.voiceAdapterCreator,
            });

            if (result.type === 'PLAYLIST' && result.playlist) {
              void musicController?.updateController(ctx.guild.id);
              return {
                success: true,
                message: `Successfully queued playlist "${result.playlist.title}" with ${result.tracksAdded} tracks into the music player! (Position: ${result.position === 0 ? 'Now playing' : '#' + result.position})`,
                trackTitle: result.playlist.title,
                trackUrl: result.playlist.url,
                position: result.position,
              };
            } else if (result.track) {
              void musicController?.updateController(ctx.guild.id);
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

      const toolResults = await services.toolExecutor.executeBatch(
        response.toolCalls,
        toolContext,
      );

      // Synthesize natural conversational response with LLM from tool outputs
      const synthesisMessages: ChatMessage[] = [
        ...messages,
        {
          role: 'assistant',
          content: replyText || '',
          toolCalls: response.toolCalls,
        },
        ...toolResults.map((tr) => ({
          role: 'tool' as const,
          toolCallId: tr.toolCallId,
          name: tr.name,
          content: tr.success
            ? (typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result))
            : JSON.stringify({ error: tr.error ?? 'Execution failed' }),
        })),
      ];

      try {
        const followUpResponse = await services.fallbackChainManager.generate({
          ...chatRequest,
          messages: synthesisMessages,
          tools: undefined,
        });
        if (followUpResponse.content) {
          replyText = followUpResponse.content;
        } else {
          replyText = formatToolResultFallback(toolResults);
        }
      } catch {
        replyText = formatToolResultFallback(toolResults);
      }
    }

    // 8. Record conversational turn
    await services.conversationManager.recordTurn(
      userContext,
      prompt,
      replyText,
      {
        provider: response.provider,
        model: response.model,
        toolCalls: response.toolCalls,
      },
    );

    // 9. Send response
    await ctx.editReply({ content: replyText });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.editReply({
      content: `❌ **Ririko AI Error**: ${message}`,
    });
  }
}

/**
 * Creates the complete dual-dispatch AI Command Suite:
 * - /ai (unified command with action choices: chat, model, channel, persona, clear)
 * - /chat & /ask (direct quick chat)
 * - /aiclear (clear user memory)
 * - /aichannel (configure dedicated AI channel)
 * - /aipersona (configure guild AI personality)
 * - /aimodel (view or switch active model)
 */
export function createAiCommands(
  services: BotServices,
  aiController: AiChatController,
): Command[] {
  // 1. Root Unified /ai Command
  const aiCommand: Command = {
    metadata: {
      name: 'ai',
      category: CommandCategory.AI,
      description: 'Interact with Ririko AI: chat, model selection, persona customization, channel setup, or clear memory.',
      aliases: ['ask'],
      usage: '/ai [action] [prompt|model|channel|style]',
      options: [
        {
          name: 'action',
          description: 'Action to perform (chat, model, channel, persona, clear)',
          type: 'STRING',
          required: false,
          choices: [
            { name: 'chat', value: 'chat' },
            { name: 'model', value: 'model' },
            { name: 'channel', value: 'channel' },
            { name: 'persona', value: 'persona' },
            { name: 'clear', value: 'clear' },
          ],
        },
        {
          name: 'prompt',
          description: 'Message to send to Ririko AI or custom persona prompt',
          type: 'STRING',
          required: false,
        },
        {
          name: 'model',
          description: 'AI model name to select (e.g. gemini-2.5-flash, gpt-4o-mini, llama3.3)',
          type: 'STRING',
          required: false,
        },
        {
          name: 'channel',
          description: 'Channel to designate as dedicated AI channel (Admin)',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'style',
          description: 'Personality speaking style preset (Admin)',
          type: 'STRING',
          required: false,
          choices: SPEAKING_STYLE_CHOICES,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      let action = ctx.options.getString('action')?.toLowerCase().trim();
      const rawArgs = ctx.options.getRawArgs();

      // For prefix calls like "!ai clear" or "!ai model", parse first word if action is not set
      if (!action && rawArgs.length > 0) {
        const first = rawArgs[0]!.toLowerCase();
        if (['chat', 'model', 'channel', 'persona', 'clear'].includes(first)) {
          action = first;
        }
      }

      // 1. Handle "clear"
      if (action === 'clear') {
        const userContext: UserContext = {
          userId: ctx.user.id,
          guildId: ctx.guildId ?? undefined,
          channelId: ctx.channelId,
          username: ctx.user.username,
          displayName: ctx.member?.displayName ?? ctx.user.username,
        };
        await services.conversationManager.clearMemory(userContext);
        await ctx.reply({
          content: '🧹 **Ririko AI Memory Cleared!**\nYour conversational history in this context has been reset.',
        });
        return;
      }

      // 2. Handle "channel" (Admin)
      if (action === 'channel') {
        if (!ctx.guildId) {
          await ctx.reply({ content: '❌ The dedicated AI channel can only be configured in a server.' });
          return;
        }

        const canManage =
          ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
          ctx.member?.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!canManage) {
          await ctx.reply({
            content: '❌ You need the **Manage Server** or **Manage Channels** permission to configure the dedicated AI channel.',
          });
          return;
        }

        const targetChannel = await ctx.options.getChannel('channel');
        const firstArg = rawArgs.length > 1 ? rawArgs[1]?.toLowerCase() : undefined;

        if (firstArg === 'reset' || firstArg === 'none' || firstArg === 'remove') {
          await services.conversationManager.removeDedicatedChannel(ctx.guildId);
          aiController.invalidateChannelCache(ctx.guildId);
          await ctx.reply({
            content: '🤖 Dedicated AI channel has been unset. Ririko will now only respond to mentions or `/ai chat`.',
          });
          return;
        }

        if (targetChannel) {
          await services.conversationManager.setDedicatedChannel(ctx.guildId, targetChannel.id);
          aiController.invalidateChannelCache(ctx.guildId);
          await ctx.reply({
            content: `🤖 <#${targetChannel.id}> is now configured as the dedicated **#ririko-ai** channel!\nMembers can chat with Ririko there without needing a prefix or mention.`,
          });
          return;
        }

        // Show current dedicated channel
        const currentChannelId = await services.conversationManager.getDedicatedChannel(ctx.guildId);
        if (currentChannelId) {
          await ctx.reply({
            content: `🤖 Current dedicated AI channel is <#${currentChannelId}>.\nTo change it, use \`/ai action:channel channel:#channel\` or \`!ai channel #channel\`.`,
          });
        } else {
          await ctx.reply({
            content: '🤖 No dedicated AI channel is currently configured for this server.\nUse `/ai action:channel channel:#channel` to set one!',
          });
        }
        return;
      }

      // 3. Handle "persona" (Admin)
      if (action === 'persona') {
        if (!ctx.guildId) {
          await ctx.reply({ content: '❌ Guild persona customization is only available in a server.' });
          return;
        }

        const style = ctx.options.getString('style');
        let prompt = ctx.options.getString('prompt');

        if (ctx.source === 'prefix' && rawArgs.length > 1) {
          const secondArg = rawArgs[1]!.toUpperCase();
          if (['FRIENDLY_ANIME', 'TSUNDERE', 'KUUDERE', 'DANDERE', 'GENKI', 'FORMAL'].includes(secondArg)) {
            prompt = rawArgs.slice(2).join(' ') || null;
          } else {
            prompt = rawArgs.slice(1).join(' ') || null;
          }
        }

        if (style || prompt) {
          const canManage = ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild);
          if (!canManage) {
            await ctx.reply({
              content: '❌ You need the **Manage Server** permission to customize the guild AI persona.',
            });
            return;
          }

          const updateData: { speakingStyle?: SpeakingStyle; personalityPrompt?: string } = {};
          if (style) updateData.speakingStyle = style as SpeakingStyle;
          if (prompt) updateData.personalityPrompt = prompt;

          await services.conversationManager.setGuildPreferences(ctx.guildId, updateData);
          await ctx.reply({
            content: `🎭 **Ririko AI Persona Updated!**\n• **Speaking Style**: \`${style ?? 'Unchanged'}\`\n• **Custom Prompt**: ${prompt ? `\`${prompt}\`` : '*Unchanged*'}`,
          });
          return;
        }

        // Display current persona
        const prefs = await services.conversationManager.getGuildPreferences(ctx.guildId);
        const embed = new EmbedBuilder()
          .setColor(0xff69b4)
          .setTitle('🎭 Ririko AI Guild Persona Configuration')
          .setDescription('Customize how Ririko speaks in this server.')
          .addFields(
            {
              name: 'Current Style Preset',
              value: `\`${prefs?.speakingStyle ?? 'FRIENDLY_ANIME'}\``,
              inline: true,
            },
            {
              name: 'Custom Prompt',
              value: prefs?.personalityPrompt ? `\`${prefs.personalityPrompt}\`` : '*None (using defaults)*',
              inline: false,
            },
            {
              name: 'Available Presets',
              value: '`FRIENDLY_ANIME`, `TSUNDERE`, `KUUDERE`, `DANDERE`, `GENKI`, `FORMAL`',
            },
          );

        await ctx.reply({ embeds: [embed] });
        return;
      }

      // 4. Handle "model"
      if (action === 'model') {
        const modelArg = ctx.options.getString('model') ?? (rawArgs.length > 1 ? rawArgs[1] : undefined);

        if (modelArg) {
          if (ctx.guildId) {
            await services.conversationManager.setGuildPreferences(ctx.guildId, {
              modelOverride: modelArg,
            });
          }
          await ctx.reply({
            content: `🧠 **AI Model Preference Saved!**\nDefault model is now set to \`${modelArg}\`.`,
          });
          return;
        }

        // List providers and active model
        const providers = services.fallbackChainManager.getProviders();
        const guildPrefs = ctx.guildId ? await services.conversationManager.getGuildPreferences(ctx.guildId) : null;
        const currentModel = guildPrefs?.modelOverride ?? '(System Default)';

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🧠 Ririko AI Available Models & Providers')
          .setDescription(`Active server model: **\`${currentModel}\`**`)
          .addFields(
            providers.map((p) => ({
              name: `${p.name} (${p.id}) ${p.isAvailable ? '🟢 Available' : '🔴 Unavailable'}`,
              value: `• Default: \`${p.defaultModel}\`\n• Supported: ${p.supportedModels.map((m) => `\`${m}\``).join(', ')}`,
            })),
          )
          .setFooter({ text: 'To change your preference: /ai action:model model:<model-name>' });

        await ctx.reply({ embeds: [embed] });
        return;
      }

      // 5. Handle "chat" or direct query
      let prompt = ctx.options.getString('prompt');
      if (!prompt && rawArgs.length > 0) {
        if (rawArgs[0]!.toLowerCase() === 'chat') {
          prompt = rawArgs.slice(1).join(' ').trim();
        } else {
          prompt = rawArgs.join(' ').trim();
        }
      }

      if (!prompt) {
        await ctx.reply({
          content: '👋 **Konnichiwa!** How can I help you today?\nAsk me a question with `/ai prompt: "Your question here"` or `/chat <prompt>`.',
        });
        return;
      }

      await executeAiChatTurn(ctx, services, prompt, aiController.musicController);
    },
  };

  // 2. Direct /chat & /ask Command
  const chatCommand: Command = {
    metadata: {
      name: 'chat',
      category: CommandCategory.AI,
      description: 'Have a conversation with Ririko AI.',
      aliases: ['c'],
      usage: '/chat <prompt>',
      options: [
        {
          name: 'prompt',
          description: 'The question or message for Ririko AI',
          type: 'STRING',
          required: true,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const prompt = ctx.options.getString('prompt') ?? ctx.options.getRawArgs().join(' ').trim();
      if (!prompt) {
        await ctx.reply({
          content: '👋 Please provide a question or topic to chat about! (e.g. `/chat prompt: What is an anime?`)',
        });
        return;
      }
      await executeAiChatTurn(ctx, services, prompt, aiController.musicController);
    },
  };

  // 3. /aiclear Command
  const clearCommand: Command = {
    metadata: {
      name: 'aiclear',
      category: CommandCategory.AI,
      description: 'Reset and clear your conversation history with Ririko AI.',
      aliases: ['clearchat', 'reset-ai'],
      usage: '/aiclear',
    },
    async execute(ctx: CommandContext): Promise<void> {
      const userContext: UserContext = {
        userId: ctx.user.id,
        guildId: ctx.guildId ?? undefined,
        channelId: ctx.channelId,
        username: ctx.user.username,
        displayName: ctx.member?.displayName ?? ctx.user.username,
      };
      await services.conversationManager.clearMemory(userContext);
      await ctx.reply({
        content: '🧹 **Ririko AI Memory Cleared!**\nYour conversational history in this context has been reset.',
      });
    },
  };

  // 4. /aichannel Command
  const channelCommand: Command = {
    metadata: {
      name: 'aichannel',
      category: CommandCategory.AI,
      description: 'Set or remove the dedicated #ririko-ai channel for this server.',
      aliases: ['setaichannel'],
      usage: '/aichannel [channel]',
      isGuildOnly: true,
      options: [
        {
          name: 'channel',
          description: 'Channel to bind as dedicated AI channel (or omit/reset to remove)',
          type: 'CHANNEL',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;

      const canManage =
        ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild) ||
        ctx.member?.permissions.has(PermissionFlagsBits.ManageChannels);

      if (!canManage) {
        await ctx.reply({
          content: '❌ You need the **Manage Server** or **Manage Channels** permission to configure the dedicated AI channel.',
        });
        return;
      }

      const rawArgs = ctx.options.getRawArgs();
      if (rawArgs.length > 0 && ['reset', 'none', 'remove'].includes(rawArgs[0]!.toLowerCase())) {
        await services.conversationManager.removeDedicatedChannel(ctx.guildId);
        aiController.invalidateChannelCache(ctx.guildId);
        await ctx.reply({
          content: '🤖 Dedicated AI channel has been unset. Ririko will now only respond to mentions or `/ai chat`.',
        });
        return;
      }

      const targetChannel = (await ctx.options.getChannel('channel')) ?? ctx.channel;
      if (targetChannel) {
        await services.conversationManager.setDedicatedChannel(ctx.guildId, targetChannel.id);
        aiController.invalidateChannelCache(ctx.guildId);
        await ctx.reply({
          content: `🤖 <#${targetChannel.id}> is now configured as the dedicated **#ririko-ai** channel!\nMembers can chat with Ririko there with zero prefix or mention required.`,
        });
        return;
      }

      const current = await services.conversationManager.getDedicatedChannel(ctx.guildId);
      await ctx.reply({
        content: current
          ? `🤖 Current dedicated AI channel: <#${current}>.`
          : '🤖 No dedicated AI channel is configured. Use `/aichannel [channel]` to set one.',
      });
    },
  };

  // 5. /aipersona Command
  const personaCommand: Command = {
    metadata: {
      name: 'aipersona',
      category: CommandCategory.AI,
      description: 'Configure server-wide AI personality style preset and custom prompt.',
      aliases: ['aistyle'],
      usage: '/aipersona [style] [prompt]',
      isGuildOnly: true,
      options: [
        {
          name: 'style',
          description: 'Speaking style preset',
          type: 'STRING',
          required: false,
          choices: SPEAKING_STYLE_CHOICES,
        },
        {
          name: 'prompt',
          description: 'Custom guild personality prompt instruction',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guildId) return;

      const style = ctx.options.getString('style');
      let prompt = ctx.options.getString('prompt');
      const rawArgs = ctx.options.getRawArgs();

      if (ctx.source === 'prefix' && rawArgs.length > 0) {
        const firstArg = rawArgs[0]!.toUpperCase();
        if (['FRIENDLY_ANIME', 'TSUNDERE', 'KUUDERE', 'DANDERE', 'GENKI', 'FORMAL'].includes(firstArg)) {
          prompt = rawArgs.slice(1).join(' ') || null;
        } else {
          prompt = rawArgs.join(' ') || null;
        }
      }

      if (style || prompt) {
        const canManage = ctx.member?.permissions.has(PermissionFlagsBits.ManageGuild);
        if (!canManage) {
          await ctx.reply({
            content: '❌ You need the **Manage Server** permission to customize the guild AI persona.',
          });
          return;
        }

        const updateData: { speakingStyle?: SpeakingStyle; personalityPrompt?: string } = {};
        if (style) updateData.speakingStyle = style as SpeakingStyle;
        if (prompt) updateData.personalityPrompt = prompt;

        await services.conversationManager.setGuildPreferences(ctx.guildId, updateData);
        await ctx.reply({
          content: `🎭 **Ririko AI Persona Updated!**\n• **Speaking Style**: \`${style ?? 'Unchanged'}\`\n• **Custom Prompt**: ${prompt ? `\`${prompt}\`` : '*Unchanged*'}`,
        });
        return;
      }

      const prefs = await services.conversationManager.getGuildPreferences(ctx.guildId);
      const embed = new EmbedBuilder()
        .setColor(0xff69b4)
        .setTitle('🎭 Ririko AI Guild Persona Configuration')
        .setDescription('Customize how Ririko speaks in this server.')
        .addFields(
          {
            name: 'Current Style Preset',
            value: `\`${prefs?.speakingStyle ?? 'FRIENDLY_ANIME'}\``,
            inline: true,
          },
          {
            name: 'Custom Prompt',
            value: prefs?.personalityPrompt ? `\`${prefs.personalityPrompt}\`` : '*None (using defaults)*',
            inline: false,
          },
          {
            name: 'Available Presets',
            value: '`FRIENDLY_ANIME`, `TSUNDERE`, `KUUDERE`, `DANDERE`, `GENKI`, `FORMAL`',
          },
        );

      await ctx.reply({ embeds: [embed] });
    },
  };

  // 6. /aimodel Command
  const modelCommand: Command = {
    metadata: {
      name: 'aimodel',
      category: CommandCategory.AI,
      description: 'View available AI providers or select your personal preferred model.',
      aliases: ['setmodel'],
      usage: '/aimodel [model]',
      options: [
        {
          name: 'model',
          description: 'Model name to set (e.g. gemini-2.5-flash, gpt-4o-mini, llama3.3)',
          type: 'STRING',
          required: false,
        },
      ],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const modelArg = ctx.options.getString('model') ?? ctx.options.getRawArgs()[0];

      if (modelArg) {
        if (ctx.guildId) {
          await services.conversationManager.setGuildPreferences(ctx.guildId, {
            modelOverride: modelArg,
          });
        }
        await ctx.reply({
          content: `🧠 **AI Model Preference Saved!**\nDefault model is now set to \`${modelArg}\`.`,
        });
        return;
      }

      const providers = services.fallbackChainManager.getProviders();
      const guildPrefs = ctx.guildId ? await services.conversationManager.getGuildPreferences(ctx.guildId) : null;
      const currentModel = guildPrefs?.modelOverride ?? '(System Default)';

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🧠 Ririko AI Available Models & Providers')
        .setDescription(`Active server model: **\`${currentModel}\`**`)
        .addFields(
          providers.map((p) => ({
            name: `${p.name} (${p.id}) ${p.isAvailable ? '🟢 Available' : '🔴 Unavailable'}`,
            value: `• Default: \`${p.defaultModel}\`\n• Supported: ${p.supportedModels.map((m) => `\`${m}\``).join(', ')}`,
          })),
        )
        .setFooter({ text: 'To change your preference: /aimodel [model-name]' });

      await ctx.reply({ embeds: [embed] });
    },
  };

  return [
    aiCommand,
    chatCommand,
    clearCommand,
    channelCommand,
    personaCommand,
    modelCommand,
  ];
}
