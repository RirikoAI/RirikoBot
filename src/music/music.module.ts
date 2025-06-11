import { forwardRef, Module } from '@nestjs/common';
import { DiscordModule } from '#discord/discord.module';
import { MusicService } from '#music/music.service';
import { DatabaseModule } from '#database/database.module';
import { DatabaseService } from '#database/database.service';
import { ConfigModule } from '@nestjs/config';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [DatabaseModule, ConfigModule, forwardRef(() => DiscordModule)],
  providers: [MusicService, DatabaseService],
  exports: [MusicService],
})
export class MusicModule {}
