import { Logger } from '@nestjs/common';
import {  Events } from 'discord.js';
import { DiscordClient } from "#discord/discord.client";
import { CommandService } from "#command/command.service";

export const ReadyEvent = (client: DiscordClient, commandService: CommandService) => {
  client.once(Events.ClientReady, () => {
    Logger.log('Bot is ready!', 'Ririko DiscordServiceEventReady');
  });
};
