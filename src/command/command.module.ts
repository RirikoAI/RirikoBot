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

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => DiscordModule),
    forwardRef(() => AvcModule),
    // Import all command's ORM entities in here
    TypeOrmModule.forFeature([Guild]),
    TypeOrmModule.forFeature([VoiceChannel]),
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
        // Inject all command's repositories in here
        getRepositoryToken(Guild),
        getRepositoryToken(VoiceChannel),
      ],
      // Define the keys for the shared services in order of the inject array above
      useFactory: (...service): SharedServices => ({
        config: service[0],
        discord: service[1],
        commandService: service[2],
        autoVoiceChannelService: service[3],
        guildRepository: service[4],
        voiceChannelRepository: service[5],
      }),
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
  guildRepository: Repository<Guild>;
  voiceChannelRepository: Repository<VoiceChannel>;
};
