import { forwardRef, Module } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { DiscordController } from './discord.controller';
import { CommandModule } from '#command/command.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AvcModule } from '#avc/avc.module';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => CommandModule),
    forwardRef(() => AvcModule),
  ],
  providers: [DiscordService, ConfigService],
  exports: [DiscordService],
  controllers: [DiscordController],
})
export class DiscordModule {}
