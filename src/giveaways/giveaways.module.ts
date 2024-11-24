import { Module } from '@nestjs/common';
import { GiveawaysService } from './giveaways.service';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  providers: [GiveawaysService],
  exports: [GiveawaysService],
})
export class GiveawaysModule {}
