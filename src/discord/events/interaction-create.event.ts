import { DiscordClient } from '#discord/discord.client';
import { EmbedBuilder, Events } from 'discord.js';
import { CommandService } from '#command/command.service';
import { Logger } from '@nestjs/common';
import { DiscordInteraction } from '#command/command.types';

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
    async (interaction: DiscordInteraction) => {
      try {
        // check if the interaction is a button interaction
        if (interaction?.isButton()) {
          await commandService.checkButton(interaction);
          return;
        }

        // check if the interaction is a modal menu interaction
        if (interaction.isModalSubmit()) {
          await commandService.checkModal(interaction);
          return;
        }

        await commandService.checkInteractionCommand(interaction);
      } catch (error) {
        Logger.error(error.message, error.stack);
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setDescription(error.message);
        await interaction.channel?.send({ embeds: [errorEmbed] });
      }
    },
  );
};
