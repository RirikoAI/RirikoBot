import type {
  APIActionRowComponent,
  APIButtonComponentWithCustomId,
  APIEmbed,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import type { GiveawayEngine } from './engine.js';
import type { Giveaway } from './types.js';

/**
 * Giveaway messages for both discord.js and the dashboard's REST client: the edit is raw API
 * JSON (discord.js accepts it too); announcements ping only `mentionUserIds`.
 */
export interface GiveawayEndedMessages {
  /** Replaces the giveaway message: the ended embed and a disabled entry button. */
  edit: {
    embeds: APIEmbed[];
    components: APIActionRowComponent<APIButtonComponentWithCustomId>[];
  };
  /** Posted in the giveaway's channel. */
  announcement: GiveawayAnnouncement;
}

export interface GiveawayAnnouncement {
  content: string;
  /** The only users the message may ping: the winners. */
  mentionUserIds: string[];
}

/** Link to the giveaway message, or null before the message was sent. */
export function giveawayMessageUrl(giveaway: Giveaway): string | null {
  return giveaway.messageId
    ? `https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId}`
    : null;
}

function mentions(userIds: readonly string[]): string {
  return userIds.map((id) => `<@${id}>`).join(', ');
}

export function buildEndedMessages(
  engine: Pick<GiveawayEngine, 'formatGiveawayEmbed' | 'formatGiveawayButton'>,
  giveaway: Giveaway,
  entryCount: number,
  winnerIds: readonly string[],
): GiveawayEndedMessages {
  const ended = { ...giveaway, isEnded: true };
  const embed = engine.formatGiveawayEmbed(ended, entryCount, [...winnerIds]);
  const button = engine.formatGiveawayButton(giveaway.id, true, entryCount);
  const url = giveawayMessageUrl(giveaway);
  return {
    edit: {
      embeds: [{ ...embed, timestamp: embed.timestamp.toISOString() }],
      components: [
        {
          type: 1 as ComponentType.ActionRow,
          components: [
            {
              type: 2 as ComponentType.Button,
              custom_id: button.customId,
              label: button.label,
              style: button.style as ButtonStyle.Primary | ButtonStyle.Secondary,
              disabled: true,
              emoji: button.emoji,
            },
          ],
        },
      ],
    },
    announcement: {
      content:
        winnerIds.length > 0
          ? `🎉 Congratulations ${mentions(winnerIds)}! You won **${giveaway.prize}**!${url ? `\n${url}` : ''}`
          : `⚠️ Giveaway for **${giveaway.prize}** has ended with no eligible winners.`,
      mentionUserIds: [...winnerIds],
    },
  };
}

export function buildRerollAnnouncement(
  giveaway: Giveaway,
  winnerIds: readonly string[],
): GiveawayAnnouncement {
  const url = giveawayMessageUrl(giveaway);
  return {
    content: `🎉 **Giveaway Rerolled!**\nNew Winner(s): ${mentions(winnerIds)}!\nYou won **${giveaway.prize}**!${url ? `\n${url}` : ''}`,
    mentionUserIds: [...winnerIds],
  };
}
