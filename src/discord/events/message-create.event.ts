import { Logger } from '@nestjs/common';
import { Client, EmbedBuilder, Events } from 'discord.js';
import { CommandService } from '../../command/command.service';

export const messageCreateEvent = (
  client: Client,
  commandService: CommandService,
) => {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return false;

    try {
      commandService.checkPrefixCommand(message);
    } catch (error) {
      Logger.error(error.message, error.stack);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setDescription(error.message);
      message.channel.send({ embeds: [errorEmbed] });
    }
  });
};
