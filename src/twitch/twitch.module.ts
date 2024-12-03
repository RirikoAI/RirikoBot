import { Module } from '@nestjs/common';
import { TwitchService } from '#twitch/twitch.service';

/**
 * The main application module.
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [],
  controllers: [],
  providers: [TwitchService],
  exports: [TwitchService],
})
export class TwitchModule {}
