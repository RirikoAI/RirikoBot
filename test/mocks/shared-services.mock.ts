import { ConfigService } from "@nestjs/config";
import { DiscordService } from "#discord/discord.service";
import { CommandService } from "#command/command.service";
import { AvcService } from "#avc/avc.service";
import { Repository } from "typeorm";
import { Guild } from "#database/entities/guild.entity";
import { VoiceChannel } from "#database/entities/voice-channel.entity";
import { MusicChannel } from "#database/entities/music-channel.entity";

export type SharedServicesMock = {
  config: ConfigService;
  discord: DiscordService;
  commandService: CommandService;
  autoVoiceChannelService: AvcService;
  guildRepository: Repository<Guild>;
  voiceChannelRepository: Repository<VoiceChannel>;
  musicChannelRepository: Repository<MusicChannel>;
} | any;