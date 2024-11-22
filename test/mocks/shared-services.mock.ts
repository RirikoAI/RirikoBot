import { ConfigService } from '@nestjs/config';
import { DiscordService } from '#discord/discord.service';
import { CommandService } from '#command/command.service';
import { Repository } from "typeorm";
import { Guild } from "#database/entities/guild.entity";
import { VoiceChannel } from "#database/entities/voice-channel.entity";

export type SharedServicesMock = typeof TestSharedService | any;

export const TestSharedService = {
  config: {} as ConfigService,
  discord: {} as DiscordService,
  commandService: {} as CommandService,
  autoVoiceChannelService: {} as any,
  db: {
    guildRepository: Repository<Guild>,
    voiceChannelRepository: Repository<VoiceChannel>,
  } as any,
};

