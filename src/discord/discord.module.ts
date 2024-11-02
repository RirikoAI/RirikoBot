import { Module } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { DiscordController } from './discord.controller';
import { ConfigModule } from '#config/config.module';
import { ConfigService } from '#config/config.service';
import { CommandModule } from '#command/command.module';

@Module({
  imports: [ConfigModule, CommandModule],
  providers: [DiscordService, ConfigService],
  exports: [DiscordService],
  controllers: [DiscordController],
})
export class DiscordModule {}
