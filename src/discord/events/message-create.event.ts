import { Logger } from '@nestjs/common';
import { EmbedBuilder, Events } from 'discord.js';
import { CommandService } from '#command/command.service';
import { DiscordClient } from '#discord/discord.client';
import { MusicService } from '#music/music.service';
import { EconomyService } from '#economy/economy.service';

/**
 * MessageCreateEvent
 * @author Earnest Angel (https://angel.net.my)
 * @param client
 * @param commandService
 * @param musicService
 * @param economyService
 * @constructor
 */
export const MessageCreateEvent = (
  client: DiscordClient,
  commandService: CommandService,
  musicService: MusicService,
  economyService: EconomyService,
) => {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return false;

    try {
      await commandService.checkPrefixCommand(message);
      await musicService.handleMusic(message);
      await economyService.handleMessage(message);
    } catch (error) {
      Logger.error(error.message, error.stack);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setDescription(error.message);
      message.channel.send({ embeds: [errorEmbed] });
    }
  });
};
