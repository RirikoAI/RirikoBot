import { Injectable, Logger } from '@nestjs/common';

import { MessageCreateEvent } from './events/message-create.event';
import { ReadyEvent } from './events/ready.event';
import { CommandService } from '#command/command.service';
import { ConfigService } from '@nestjs/config';
import { DiscordClient } from '#discord/discord.client';
import { InteractionCreateEvent } from '#discord/events/interaction-create.event';

/**
 * Discord Service
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class DiscordService {
  client: DiscordClient;
  ready: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly commandService: CommandService,
  ) {}

  async connect(): Promise<DiscordClient> {
    this.client = new DiscordClient();

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

  registerEvents() {
    ReadyEvent(this.client, this.commandService);
    MessageCreateEvent(this.client, this.commandService);
    InteractionCreateEvent(this.client, this.commandService);
  }
}
