import { forwardRef, Module } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { DiscordController } from './discord.controller';
import { CommandModule } from '#command/command.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AvcModule } from '#avc/avc.module';
import { MusicModule } from '#music/music.module';
import { GiveawaysModule } from '#giveaways/giveaways.module';

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
  ],
  providers: [DiscordService, ConfigService],
  exports: [DiscordService],
  controllers: [DiscordController],
})
export class DiscordModule {}
