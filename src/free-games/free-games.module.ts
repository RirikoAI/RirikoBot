import { forwardRef, Module } from '@nestjs/common';
import { FreeGamesService } from './free-games.service';
import { FreeGamesScheduler } from './free-games.scheduler';
import { DiscordModule } from '#discord/discord.module';
import { DatabaseModule } from '#database/database.module';
import { CommandModule } from '#command/command.module';

/**
 * FreeGamesModule
 * @description Module for free games functionality
 * @author AI Assistant
 */
@Module({
  imports: [
    forwardRef(() => DiscordModule),
    DatabaseModule,
    forwardRef(() => CommandModule),
  ],
  providers: [FreeGamesService, FreeGamesScheduler],
  exports: [FreeGamesService],
})
export class FreeGamesModule {}
