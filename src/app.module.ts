import { Module } from '@nestjs/common';
import { RootController } from '#api/root.controller';
import { RootService } from '#api/root.service';
import { DiscordModule } from '#discord/discord.module';
import { RootModule } from '#api/root.module';
import { CommandModule } from '#command/command.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
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

/**
 * The main application module.
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
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
  ],
  controllers: [RootController, EconomyController],
  providers: [RootService, ConfigService],
})
export class AppModule {}
