import { forwardRef, Module } from '@nestjs/common';
import { DiscordModule } from '#discord/discord.module';
import { MusicService } from '#music/music.service';
import { DatabaseModule } from '#database/database.module';
import { DatabaseService } from '#database/database.service';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [forwardRef(() => DiscordModule), DatabaseModule],
  providers: [MusicService, DatabaseService],
  exports: [MusicService],
})
export class MusicModule {}
