import { Logger } from '@nestjs/common';
import { Events } from 'discord.js';
import { DiscordClient } from '#discord/discord.client';
import { CommandService } from '#command/command.service';
import CommandsLoaderUtil from '#util/command/commands-loader.util';

/**
 * Ready event
 * @author Earnest Angel (https://angel.net.my)
 * @param client
 * @param commandService
 * @constructor
 */
export const GuildCreateEvent = (
  client: DiscordClient,
  commandService: CommandService,
) => {
  client.on(Events.GuildCreate, async (guild) => {
    Logger.log(
      `${client.user.displayName} has joined the server: ${guild.name}`,
      'GuildCreateEvent',
    );

    await CommandsLoaderUtil.registerInteractionCommandsInAGuild(
      commandService.registeredGuildCommands,
      commandService.discord.client,
      commandService.config,
      guild.id,
    );
  });
};
