import { Module } from '@nestjs/common';

import { CommandService } from './command.service';
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [ConfigModule],
  providers: [CommandService],
  exports: [CommandService],
})
export class CommandModule {}
