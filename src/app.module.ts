import { Module } from '@nestjs/common';
import { RootController } from '#api/root.controller';
import { RootService } from '#api/root.service';
import { DiscordModule } from '#discord/discord.module';
import { RootModule } from '#api/root.module';
import { CommandModule } from '#command/command.module';
import {
  ConfigModule as EnvConfigModule,
  ConfigService as EnvConfigService,
} from '@nestjs/config';
import appConfig from '#config/app.config';
import databaseConfig from '#config/database.config';
import discordConfig from '#config/discord.config';
import { AvcModule } from '#avc/avc.module';
import { MusicModule } from '#music/music.module';
import { DatabaseModule } from '#database/database.module';
import { EconomyController } from '#economy/economy.controller';
import { EconomyModule } from '#economy/economy.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TwitchModule } from '#twitch/twitch.module';
import { ConfigModule as RirikoConfigModule } from '#config/config.module';
import { ConfigService as RirikoConfigService } from '#config/config.service';
import { CliModule } from '#cli/cli.module';
import { ModerationModule } from './moderation/moderation.module';

/**
 * The main application module.
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    RirikoConfigModule,
    ScheduleModule.forRoot(),
    EnvConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, discordConfig],
      envFilePath: ['.env'],
    }),
    RootModule,
    DiscordModule,
    CommandModule,
    AvcModule,
    MusicModule,
    DatabaseModule,
    EconomyModule,
    TwitchModule,
    CliModule,
    ModerationModule,
  ],
  controllers: [RootController, EconomyController],
  providers: [RootService, EnvConfigService, RirikoConfigService],
})
export class AppModule {}
