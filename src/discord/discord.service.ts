import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '../config/config.service';
import { Client, GatewayIntentBits } from 'discord.js';

@Injectable()
export class DiscordService {
  client: Client;
  ready: boolean;

  constructor(private readonly config: ConfigService) {}

  connect(): Client {
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });

    this.client.on('ready', () => {
      this.ready = true;
    });

    this.client.login(this.config.discordBotToken).then((r) => {
      Logger.log(`Ririko says Hello! I'm also known as: ${this.client.user.tag}`);
    });

    return this.client;
  }
}
