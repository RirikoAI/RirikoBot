import { Module } from '@nestjs/common';
import { RootController } from '#api/root.controller';
import { RootService } from '#api/root.service';
import { DiscordModule } from '#discord/discord.module';
import { DiscordService } from '#discord/discord.service';
import { RootModule } from '#api/root.module';
import { CommandModule } from '#command/command.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmConfigService } from '#database/typeorm-config.service';
import { DataSource, DataSourceOptions } from 'typeorm';
import appConfig from '#config/app.config';
import databaseConfig from '#config/database.config';
import discordConfig from '#config/discord.config';

/**
 * The main application module.
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, discordConfig],
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      useClass: TypeOrmConfigService,
      dataSourceFactory: async (options: DataSourceOptions) =>
        new DataSource(options).initialize(),
    }),
    RootModule,
    DiscordModule,
    CommandModule,
  ],
  controllers: [RootController],
  providers: [RootService, ConfigService, DiscordService],
})
export class AppModule {}
