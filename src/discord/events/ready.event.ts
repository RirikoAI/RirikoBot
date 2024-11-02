import { Logger } from '@nestjs/common';
import { Client, Events } from 'discord.js';

export const ReadyEvent = (client: Client) => {
  client.once(Events.ClientReady, () => {
    Logger.log('Bot is ready!', 'Ririko DiscordServiceEventReady');
  });
};
