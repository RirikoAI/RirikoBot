import { DiscordClient } from '#discord/discord.client';
import { CommandInteraction, EmbedBuilder, Events } from 'discord.js';
import { CommandService } from '#command/command.service';
import { Logger } from '@nestjs/common';

/**
 * InteractionCreateEvent
 * @author Earnest Angel (https://angel.net.my)
 * @param client
 * @param commandService
 * @constructor
 */
export const InteractionCreateEvent = (
  client: DiscordClient,
  commandService: CommandService,
) => {
  client.on(
    Events.InteractionCreate,
    async (interaction: CommandInteraction) => {
      try {
        await commandService.checkSlashCommand(interaction);
      } catch (error) {
        Logger.error(error.message, error.stack);
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setDescription(error.message);
        await interaction.reply({ embeds: [errorEmbed] });
      }
    },
  );
};
