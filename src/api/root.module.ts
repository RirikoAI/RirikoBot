import { Module } from '@nestjs/common';
import { RootService } from './root.service';

@Module({
  providers: [RootService],
  exports: [RootService],
})
export class RootModule {}
