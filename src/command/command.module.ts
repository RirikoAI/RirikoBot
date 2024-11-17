import { forwardRef, Module } from '@nestjs/common';
import { CommandService } from './command.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiscordModule } from '#discord/discord.module';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DiscordService } from '#discord/discord.service';
import { Repository } from 'typeorm';
import { Guild } from '#database/entities/guild.entity';
import { VoiceChannel } from '#database/entities/voice-channel.entity';
import { AvcService } from '#avc/avc.service';
import { AvcModule } from '#avc/avc.module';
import { MusicChannel } from '#database/entities/music-channel.entity';
import { MusicModule } from '#music/music.module';
import { MusicService } from '#music/music.service';
import { Playlist } from '#database/entities/playlist.entity';
import { Track } from "#database/entities/track.entity";

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => DiscordModule),
    forwardRef(() => AvcModule),
    MusicModule,
    // Import all command's ORM entities in here
    TypeOrmModule.forFeature([Guild]),
    TypeOrmModule.forFeature([VoiceChannel]),
    TypeOrmModule.forFeature([MusicChannel]),
    TypeOrmModule.forFeature([Playlist]),
    TypeOrmModule.forFeature([Track]),
  ],
  providers: [
    CommandService,
    // Import all command's services in here
    {
      provide: 'SHARED_SERVICES',
      // Define the shared services to be injected
      inject: [
        ConfigService,
        DiscordService,
        CommandService,
        AvcService,
        MusicService,
        // Inject all command's repositories in here
        getRepositoryToken(Guild),
        getRepositoryToken(VoiceChannel),
        getRepositoryToken(MusicChannel),
        getRepositoryToken(Playlist),
        getRepositoryToken(Track),
      ],
      // Define the keys for the shared services in order of the inject array above
      useFactory: (...service): SharedServices => {
        let i = 0;
        return {
          config: service[i++],
          discord: service[i++],
          commandService: service[i++],
          autoVoiceChannelService: service[i++],
          musicService: service[i++],
          guildRepository: service[i++],
          voiceChannelRepository: service[i++],
          musicChannelRepository: service[i++],
          playlistRepository: service[i++],
          trackRepository: service[i++],
        };
      },
    },
  ],
  exports: [CommandService],
})
export class CommandModule {}

/**
 * Services that will be exposed to all commands.
 */
export type SharedServices = {
  config: ConfigService;
  discord: DiscordService;
  commandService: CommandService;
  autoVoiceChannelService: AvcService;
  musicService: MusicService;
  guildRepository: Repository<Guild>;
  voiceChannelRepository: Repository<VoiceChannel>;
  musicChannelRepository: Repository<MusicChannel>;
  playlistRepository: Repository<Playlist>;
  trackRepository: Repository<Track>;
};
