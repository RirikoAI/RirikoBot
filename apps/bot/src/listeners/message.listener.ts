import type { Client, Message } from 'discord.js';
import { EconomyEventType } from '@ririko/services';
import type { BotServices } from '../services.js';

/**
 * Gateway Message Listener: Evaluates anti-spam heuristics, dispatches Economy events,
 * and awards experience points with level-up notifications.
 */
export function registerMessageListener(client: Client, services: BotServices): void {
  client.on('messageCreate', async (message: Message) => {
    // Ignore bots and direct messages
    if (message.author.bot || !message.guild) return;

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
