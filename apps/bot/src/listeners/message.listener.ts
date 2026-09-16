import type { Client, Message } from 'discord.js';
import { EconomyEventType } from '@ririko/services';
import type { BotServices } from '../services.js';
import type { MusicEmbedController } from '../controllers/music-embed.controller.js';

/**
 * Gateway Message Listener: Evaluates anti-spam heuristics, dispatches Economy events,
 * awards experience points, and routes dedicated music channel song requests.
 */
export function registerMessageListener(
  client: Client,
  services: BotServices,
  musicController?: MusicEmbedController,
): void {
  client.on('messageCreate', async (message: Message) => {
    // Ignore bots and direct messages
    if (message.author.bot || !message.guild) return;

    // Check if message was sent in dedicated music channel
    if (musicController) {
      const handled = await musicController.handleMusicChannelMessage(message).catch(() => false);
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
