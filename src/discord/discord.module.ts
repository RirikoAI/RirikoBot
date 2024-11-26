import { forwardRef, Module } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { DiscordController } from './discord.controller';
import { CommandModule } from '#command/command.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AvcModule } from '#avc/avc.module';
import { MusicModule } from '#music/music.module';
import { GiveawaysModule } from '#giveaways/giveaways.module';
import { EconomyModule } from '#economy/economy.module';
import { EconomyService } from '#economy/economy.service';
import { DatabaseModule } from '#database/database.module';
import { DatabaseService } from '#database/database.service';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => CommandModule),
    forwardRef(() => AvcModule),
    forwardRef(() => MusicModule),
    forwardRef(() => GiveawaysModule),
    forwardRef(() => EconomyModule),
    DatabaseModule,
  ],
  providers: [DiscordService, ConfigService, EconomyService, DatabaseService],
  exports: [DiscordService],
  controllers: [DiscordController],
})
export class DiscordModule {}
