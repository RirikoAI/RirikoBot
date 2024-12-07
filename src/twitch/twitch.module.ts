import { forwardRef, Module } from '@nestjs/common';
import { TwitchService } from '#twitch/twitch.service';
import { DatabaseModule } from '#database/database.module';
import { ConfigModule as RirikoConfigModule } from '#config/config.module';
import { DiscordModule } from '#discord/discord.module';

/**
 * The main application module.
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    forwardRef(() => DatabaseModule),
    forwardRef(() => DiscordModule),
    RirikoConfigModule,
  ],
  controllers: [],
  providers: [TwitchService],
  exports: [TwitchService],
})
export class TwitchModule {}
