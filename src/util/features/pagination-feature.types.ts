import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { APIEmbed } from 'discord.js';

/**
 * Array of embeds to be paginated.
 * @see APIEmbed
 */
export type Pages = APIEmbed[];

export type PaginationFeatureParams = {
  /**
   * The interaction that triggered the pagination.
   * @type {DiscordMessage | DiscordInteraction}
   * @see DiscordMessage
   * @see DiscordInteraction
   */
  interaction: DiscordMessage | DiscordInteraction | any;

  /**
   * Array of embeds to be paginated.
   * @type {Pages}
   * @see Pages
   * @see APIEmbed
   */
  pages: Pages;
};
