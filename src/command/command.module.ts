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
import { SharedServiceUtil } from '#util/command/shared-service.util';
import { EconomyModule } from '#economy/economy.module';
import { EconomyService } from '#economy/economy.service';
import { FreeGamesModule } from '#free-games/free-games.module';
import { FreeGamesService } from '#free-games/free-games.service';
import { ReminderService } from '#reminder/reminder.service';
import { ReminderModule } from '#reminder/reminder.module';
import { AiModule } from '#ai/ai.module';
import { AiService } from '#ai/ai.service';
import { ReactionRoleModule } from '#reaction-role/reaction-role.module';
import { ReactionRoleService } from '#reaction-role/reaction-role.service';

const modules = [
  ConfigModule,
  forwardRef(() => DiscordModule),
  forwardRef(() => AvcModule),
  AvcModule,
  MusicModule,
  EconomyModule,
  DatabaseModule,
  FreeGamesModule,
  ReminderModule,
  AiModule,
  ReactionRoleModule,
];

export class AvailableSharedServices {
  config: ConfigService = Service(ConfigService);
  discord: DiscordService = Service(DiscordService);
  commandService: CommandService = Service(CommandService);
  autoVoiceChannelService: AvcService = Service(AvcService);
  musicService: MusicService = Service(MusicService);
  economy: EconomyService = Service(EconomyService);
  db: DatabaseService = Service(DatabaseService);
  freeGamesService: FreeGamesService = Service(FreeGamesService);
  reminderService = Service(ReminderService);
  aiServiceFactory = Service(AiService);
  reactionRoleService = Service(ReactionRoleService);
}

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: modules,
  providers: [
    CommandService,
    DatabaseService,
    SharedServiceUtil.getFactory('SHARED_SERVICES', AvailableSharedServices),
  ],
  exports: [CommandService],
})
export class CommandModule {}

export type SharedServices = AvailableSharedServices;
