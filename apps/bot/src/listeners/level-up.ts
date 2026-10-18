import type { Client } from 'discord.js';

export function levelUpText(userId: string, level: number): string {
  return `🎉 Congratulations <@${userId}>! You leveled up to **Level ${level}**!`;
}

/**
 * Posts a level-up message in `channelId`. Returns false when the channel is gone or Ririko
 * cannot post there, so the caller can fall back to another channel.
 */
export async function sendLevelUpMessage(
  client: Client,
  channelId: string,
  userId: string,
  level: number,
): Promise<boolean> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isSendable()) return false;
  const sent = await channel
    .send({ content: levelUpText(userId, level), allowedMentions: { users: [userId] } })
    .catch(() => null);
  return sent !== null;
}
