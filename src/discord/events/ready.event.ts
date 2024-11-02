import { Logger } from '@nestjs/common';
import { Client, Events } from 'discord.js';

export const readyEvent = (client: Client) => {
  client.once(Events.ClientReady, () => {
    Logger.log('Bot is ready!', 'Ririko DiscordServiceEventReady');
  });
};
