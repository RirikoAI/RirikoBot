import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '#config/config.service';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { MessageCreateEvent } from './events/message-create.event';
import { ReadyEvent } from './events/ready.event';
import { CommandService } from "#command/command.service";

@Injectable()
export class DiscordService {
  client: Client;
  ready: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly commandService: CommandService,
  ) {}

  connect(): Client {
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

    this.client
      .login(this.config.discordBotToken)
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

  registerEvents(client: Client) {
    ReadyEvent(client);
    MessageCreateEvent(client, this.commandService);
  }
}
