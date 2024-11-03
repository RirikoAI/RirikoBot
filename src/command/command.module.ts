import { forwardRef, Module } from '@nestjs/common';

import { CommandService } from './command.service';
import { ConfigModule } from '@nestjs/config';
import { DiscordModule } from '#discord/discord.module';

@Module({
  imports: [ConfigModule, forwardRef(() => DiscordModule)],
  providers: [CommandService],
  exports: [CommandService],
})
export class CommandModule {}
