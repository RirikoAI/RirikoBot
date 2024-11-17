import { forwardRef, Module } from '@nestjs/common';
import { DiscordModule } from '#discord/discord.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Guild } from '#database/entities/guild.entity';
import { MusicChannel } from '#database/entities/music-channel.entity';
import { MusicService } from "#music/music.service";

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Guild]),
    TypeOrmModule.forFeature([MusicChannel]),
    forwardRef(() => DiscordModule),
  ],
  providers: [MusicService],
  exports: [MusicService],
})
export class MusicModule {}
