import { Module } from '@nestjs/common';
import { RootService } from './root.service';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  providers: [RootService],
  exports: [RootService],
})
export class RootModule {}
