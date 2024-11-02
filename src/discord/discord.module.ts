import { Module } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { DiscordController } from './discord.controller';
import { CommandModule } from '#command/command.module';
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [ConfigModule, CommandModule],
  providers: [DiscordService, ConfigService],
  exports: [DiscordService],
  controllers: [DiscordController],
})
export class DiscordModule {}
