import { forwardRef, Module } from '@nestjs/common';
import { CommandService } from './command.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiscordModule } from '#discord/discord.module';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Guild } from '#command/guild/entities/guild.entity';
import { DiscordService } from '#discord/discord.service';
import { Repository } from "typeorm";

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => DiscordModule),
    // Import all command's ORM entities in here
    TypeOrmModule.forFeature([Guild]),
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
        // Inject all command's repositories in here
        getRepositoryToken(Guild),
      ],
      // Define the keys for the shared services in order of the inject array above
      useFactory: (...service): SharedServices => ({
        config: service[0],
        discord: service[1],
        commandService: service[2],
        guildRepository: service[3],
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
  guildRepository: Repository<Guild>;
};
