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
import authConfig from '#config/auth.config';
import mailConfig from '#config/mail.config';
import aiConfig from '#config/ai.config';
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
import { ModerationModule } from '#moderation/moderation.module';
import { AuthModule } from '#auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmConfigService } from '#database/typeorm-config.service';
import { DataSource, DataSourceOptions } from 'typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwksModule } from '#jwks/jwks.module';
import { JweModule } from '#jwe/jwe.module';
import { FreeGamesModule } from '#free-games/free-games.module';
import { ReminderModule } from '#reminder/reminder.module';
import { ReactionRoleModule } from '#reaction-role/reaction-role.module';
import { existsSync } from 'fs';
import ConfigFileUtil from '#util/config/config-file.util';

/**
 * The main application module.
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    PassportModule.register({ session: true }),
    RirikoConfigModule,
    ScheduleModule.forRoot(),
    EnvConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        authConfig,
        discordConfig,
        mailConfig,
        aiConfig,
      ],
      envFilePath: ['.env'],
      ignoreEnvFile: !existsSync('.env'),
    }),
    TypeOrmModule.forRootAsync({
      useClass: TypeOrmConfigService,
      dataSourceFactory: async (options: DataSourceOptions) => {
        return new DataSource(options).initialize();
      },
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
    AuthModule,
    JwksModule,
    JweModule,
    FreeGamesModule,
    ReminderModule,
    ReactionRoleModule,
  ],
  controllers: [RootController, EconomyController],
  providers: [RootService, EnvConfigService, RirikoConfigService],
})
export class AppModule {
  constructor() {
    // Generate configuration files if they don't exist
    ConfigFileUtil.generateConfigFiles();
  }
}
