import { forwardRef, Module } from '@nestjs/common';
import { CommandService } from './command.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiscordModule } from '#discord/discord.module';
import { DiscordService } from '#discord/discord.service';
import { AvcService } from '#avc/avc.service';
import { AvcModule } from '#avc/avc.module';
import { MusicModule } from '#music/music.module';
import { MusicService } from '#music/music.service';
import { DatabaseModule } from '#database/database.module';
import { DatabaseService } from '#database/database.service';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => DiscordModule),
    forwardRef(() => AvcModule),
    MusicModule,
    DatabaseModule,
  ],
  providers: [
    CommandService,
    DatabaseService,
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
      ],
      // Define the keys for the shared services in order of the inject array above
      useFactory: (...service): any => {
        let i = 0;
        return {
          config: service[i++],
          discord: service[i++],
          commandService: service[i++],
          autoVoiceChannelService: service[i++],
          musicService: service[i++],
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
  db: DatabaseService;
};
