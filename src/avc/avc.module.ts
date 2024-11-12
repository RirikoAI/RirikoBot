import { forwardRef, Module } from '@nestjs/common';
import { AvcService } from '#avc/avc.service';
import { DiscordModule } from '#discord/discord.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Guild } from '#database/entities/guild.entity';
import { VoiceChannel } from '#database/entities/voice-channel.entity';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Guild]),
    TypeOrmModule.forFeature([VoiceChannel]),
    forwardRef(() => DiscordModule),
  ],
  providers: [AvcService],
  exports: [AvcService],
})
export class AvcModule {}
