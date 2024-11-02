import { Module } from '@nestjs/common';

import { ConfigModule } from '../config/config.module';
import { CommandService } from './command.service';

@Module({
  imports: [ConfigModule],
  providers: [CommandService],
  exports: [CommandService],
})
export class CommandModule {}
