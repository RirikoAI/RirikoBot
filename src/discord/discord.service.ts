import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';

import { MessageCreateEvent } from './events/message-create.event';
import { ReadyEvent } from './events/ready.event';
import { CommandService } from '#command/command.service';
import { ConfigService } from '@nestjs/config';
import { DiscordClient } from '#discord/discord.client';
import { InteractionCreateEvent } from '#discord/events/interaction-create.event';
import { VoiceStateUpdateEvent } from '#discord/events/voice-state-update.event';
import { AvcService } from '#avc/avc.service';
import { MusicService } from "#music/music.service";
import DisTube from "distube";

/**
 * Discord Service
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export class DiscordService {
  client: DiscordClient;
  ready: boolean;
  musicPlayer: DisTube;

  constructor(
    private readonly configService: ConfigService,
    private readonly commandService: CommandService,
    @Inject(forwardRef(() => AvcService))
    private readonly avcService: AvcService,
    @Inject(forwardRef(() => MusicService))
    private readonly musicService: MusicService,
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
          `Logged in as ${this?.client?.user?.tag}`,
          'Ririko DiscordService',
        );
      })
      .catch((e) => {
        Logger.error(e.message, e.stack);
      });
    
    this.client.musicPlayer = await this.musicService.createPlayer();
    
    return this.client;
  }

  registerEvents() {
    ReadyEvent(this.client, this.commandService);
    MessageCreateEvent(this.client, this.commandService, this.musicService);
    InteractionCreateEvent(this.client, this.commandService);
    VoiceStateUpdateEvent(this.client, this.avcService);
  }
}
