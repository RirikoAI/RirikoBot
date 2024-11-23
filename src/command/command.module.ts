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
import { Service } from '#command/command.types';
import { SharedServiceUtil } from "#util/command/shared-service.util";

const modules = [
  ConfigModule,
  forwardRef(() => DiscordModule),
  forwardRef(() => AvcModule),
  AvcModule,
  MusicModule,
  DatabaseModule,
];

export class AvailableSharedServices {
  config: ConfigService = Service(ConfigService);
  discord: DiscordService = Service(DiscordService);
  commandService: CommandService = Service(CommandService);
  autoVoiceChannelService: AvcService = Service(AvcService);
  musicService: MusicService = Service(MusicService);
  db: DatabaseService = Service(DatabaseService);
}

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: modules,
  providers: [
    CommandService,
    DatabaseService,
    SharedServiceUtil.getFactory('SHARED_SERVICES'),
  ],
  exports: [CommandService],
})
export class CommandModule {}

export type SharedServices = AvailableSharedServices;
