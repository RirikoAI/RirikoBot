import { Logger } from '@nestjs/common';
import { EmbedBuilder, Events } from 'discord.js';
import { CommandService } from '#command/command.service';
import { DiscordClient } from "#discord/discord.client";

export const MessageCreateEvent = (
  client: DiscordClient,
  commandService: CommandService,
) => {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return false;

    try {
      await commandService.checkPrefixCommand(message);
    } catch (error) {
      Logger.error(error.message, error.stack);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setDescription(error.message);
      message.channel.send({ embeds: [errorEmbed] });
    }
  });
};
