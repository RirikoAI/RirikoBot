import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';

import { MessageCreateEvent } from './events/message-create.event';
import { ReadyEvent } from './events/ready.event';
import { CommandService } from '#command/command.service';
import { ConfigService } from '@nestjs/config';
import { DiscordClient } from '#discord/discord.client';
import { InteractionCreateEvent } from '#discord/events/interaction-create.event';
import { VoiceStateUpdateEvent } from '#discord/events/voice-state-update.event';
import { AvcService } from '#avc/avc.service';
import { MusicService } from '#music/music.service';
import { GiveawaysService } from '#giveaways/giveaways.service';
import { EconomyService } from '#economy/economy.service';
import { GuildMemberAddEvent } from '#discord/events/guild-member-add.event';
import { GuildMemberRemoveEvent } from '#discord/events/guild-member-remove.event';
import { GuildCreateEvent } from '#discord/events/guild-create.event';
import { MessageReactionAddEvent } from '#discord/events/message-reaction-add.event';
import { MessageReactionRemoveEvent } from '#discord/events/message-reaction-remove.event';
import { ReactionRoleService } from '#reaction-role/reaction-role.service';

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
    @Inject(forwardRef(() => AvcService))
    private readonly avcService: AvcService,
    @Inject(forwardRef(() => MusicService))
    private readonly musicService: MusicService,
    @Inject(forwardRef(() => GiveawaysService))
    private readonly giveawaysService: GiveawaysService,
    @Inject(forwardRef(() => EconomyService))
    private readonly economyService: EconomyService,
    @Inject(forwardRef(() => ReactionRoleService))
    private readonly reactionRoleService: ReactionRoleService,
  ) {}

  async connect(): Promise<DiscordClient> {
    this.client = new DiscordClient();

    this.client.on('ready', () => {
      this.ready = true;
    });

    await this.client
      .login(this.configService.get('discord.discordBotToken'))
      .then((r) => {
        Logger.log(
          `Logged in as ${this?.client?.user?.tag}`,
          'Ririko DiscordService',
        );
      })
      .catch((e) => {
        Logger.error(e.message, e.stack);
      });

    Logger.log('Creating music player', 'Ririko DiscordService');
    this.client.musicPlayer = await this.musicService.createPlayer();
    Logger.log('Creating giveaways manager', 'Ririko DiscordService');
    this.client.giveawaysManager = this.giveawaysService.register(this.client);
    return this.client;
  }

  registerEvents() {
    ReadyEvent(this.client, this.commandService);
    MessageCreateEvent(
      this.client,
      this.commandService,
      this.musicService,
      this.economyService,
    );
    InteractionCreateEvent(this.client, this.commandService);
    VoiceStateUpdateEvent(this.client, this.avcService);
    GuildMemberAddEvent(this.client, this.commandService);
    GuildMemberRemoveEvent(this.client, this.commandService);
    GuildCreateEvent(this.client, this.commandService);
    MessageReactionAddEvent(this.client, this.reactionRoleService);
    MessageReactionRemoveEvent(this.client, this.reactionRoleService);
  }
}
