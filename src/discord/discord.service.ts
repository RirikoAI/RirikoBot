import { Injectable, Logger } from '@nestjs/common';

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { MessageCreateEvent } from './events/message-create.event';
import { ReadyEvent } from './events/ready.event';
import { CommandService } from '#command/command.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DiscordService {
  client: Client;
  ready: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly commandService: CommandService,
  ) {}

  async connect(): Promise<Client> {
    this.client = new Client({
      intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    this.client.on('ready', () => {
      this.ready = true;
    });

    await this.client
      .login(this.configService.get('DISCORD_BOT_TOKEN'))
      .then((r) => {
        Logger.log(
          `Logged in as ${this.client.user.tag}`,
          'Ririko DiscordService',
        );
      })
      .catch((e) => {
        Logger.error(e.message, e.stack);
      });

    return this.client;
  }

  get(): Client {
    return this.client;
  }

  registerEvents() {
    ReadyEvent(this.client);
    MessageCreateEvent(this.client, this.commandService);
  }
}
