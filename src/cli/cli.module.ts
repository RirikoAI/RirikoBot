import { Module } from '@nestjs/common';
import { CliService } from './cli.service';
import { CommandModule } from '#command/command.module';

@Module({
  imports: [CommandModule],
  providers: [CliService],
})
export class CliModule {}
