import type { Client, Message } from 'discord.js';
import { EconomyEventType } from '@ririko/services';
import type { BotServices } from '../services.js';
import type { MusicEmbedController } from '../controllers/music-embed.controller.js';
import type { AiChatController } from '../controllers/ai-chat.controller.js';

/**
 * Gateway Message Listener: Evaluates anti-spam heuristics, dispatches Economy events,
 * awards experience points, and routes dedicated music channel song requests or AI chat.
 */
export function registerMessageListener(
  client: Client,
  services: BotServices,
  musicController?: MusicEmbedController,
  aiController?: AiChatController,
): void {
  client.on('messageCreate', async (message: Message) => {
    // Ignore bots and direct messages
    if (message.author.bot || !message.guild) return;

    // 0. Evaluate AutoMod pipeline (Phishing shield, Invites, Mention spam, Burst spam)
    if (services.autoModService) {
      try {
        const automodResult = await services.autoModService.processMessage({
          guildId: message.guild.id,
          channelId: message.channelId,
          userId: message.author.id,
          content: message.content,
          messageId: message.id,
          memberRoles: message.member?.roles?.cache
            ? Array.from(message.member.roles.cache.keys())
            : [],
          memberPermissions: message.member?.permissions
            ? message.member.permissions.toArray()
            : [],
          isBot: message.author.bot,
          isOwner: message.guild.ownerId === message.author.id,
          createdTimestamp: message.createdTimestamp,
          mentions: {
            users: message.mentions?.users ? message.mentions.users.size : 0,
            roles: message.mentions?.roles ? message.mentions.roles.size : 0,
            everyone: Boolean(message.mentions?.everyone),
          },
          rawMessage: {
            delete: () => message.delete(),
            author: { id: message.author.id, bot: message.author.bot },
            id: message.id,
          },
          guild: message.guild,
          member: message.member ?? undefined,
        });

        if (automodResult.matched) {
          console.warn(
            `[AutoMod] Message intercepted by rule ${automodResult.ruleType} in guild ${message.guild.id} from user ${message.author.id}`,
          );
          return; // Stop further processing; message was deleted or punished
        }
      } catch (autoModErr) {
        console.error('[MessageListener] Error during AutoMod evaluation:', autoModErr);
      }
    }

    // Check if message was sent in dedicated music channel
    if (musicController) {
      const handled = await musicController.handleMusicChannelMessage(message).catch(() => false);
      if (handled) return;
    }

    // Check if message is addressed to dedicated AI channel or mentions bot
    if (aiController) {
      const handled = await aiController.handleAiMessage(message).catch(() => false);
      if (handled) return;
    }

    const userId = message.author.id;
    const guildId = message.guild.id;

    try {
      // 1. Evaluate Anti-Spam criteria (rolling 60s cooldown, length > 5, burst/copy-paste check)
      const evaluation = services.antiSpamEvaluator.evaluateMessage(
        userId,
        guildId,
        message.content,
        message.createdTimestamp,
      );

      if (!evaluation.isAllowed) {
        return; // Spam or on cooldown; zero XP and zero rewards
      }

      // Lazily ensure user record exists in database
      await services.userRepo
        .getOrCreate(userId, {
          username: message.author.username,
          displayName: message.author.displayName ?? message.author.username,
          avatarUrl: message.author.displayAvatarURL
            ? message.author.displayAvatarURL({ extension: 'png', size: 256 })
            : undefined,
        })
        .catch(() => {});

      // 2. Dispatch Economy Event
      await services.economyService.handleEvent({
        type: EconomyEventType.MESSAGE_SENT,
        userId,
        guildId,
        source: 'CHAT_MESSAGE',
        metadata: {
          messageId: message.id,
          channelId: message.channelId,
        },
      });

      // 3. Award chat experience points (e.g. 15-25 XP random roll)
      const xpReward = Math.floor(Math.random() * 11) + 15; // 15 to 25 XP
      const xpRes = await services.levelingService.addExperience(
        userId,
        guildId,
        xpReward,
        'CHAT_MESSAGE',
      );

      // 4. Send level-up announcement if user reached new level and opted in
      if (xpRes.didLevelUp && xpRes.shouldNotify && 'send' in message.channel) {
        await message.channel
          .send({
            content: `🎉 Congratulations <@${userId}>! You leveled up to **Level ${xpRes.newLevel}**!`,
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('[MessageListener] Error processing message economy event:', err);
    }
  });
}
