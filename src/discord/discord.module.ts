import { Module } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { DiscordController } from './discord.controller';
import { ConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config.service';

@Module({
  imports: [ConfigModule],
  providers: [DiscordService, ConfigService],
  exports: [DiscordService],
  controllers: [DiscordController],
})
export class DiscordModule {}