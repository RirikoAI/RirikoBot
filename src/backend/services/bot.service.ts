import { Client, GatewayIntentBits } from 'discord.js';
import { discordToken } from "helpers/getconfig";

export class BotService extends Client  {
  constructor() {
    super({ intents: [GatewayIntentBits.Guilds] });
    
    this.on('ready', () => {
      if (this.user != null) {
        console.info(`[Ririko BE] Connected to Discord as ${this.user.tag}!`);
      }
    });
  }
}

export const DiscordBot = new BotService() as Client;
DiscordBot.login(discordToken());