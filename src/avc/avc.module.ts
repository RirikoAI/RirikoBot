import { forwardRef, Module } from '@nestjs/common';
import { AvcService } from '#avc/avc.service';
import { DiscordModule } from '#discord/discord.module';

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [forwardRef(() => DiscordModule)],
  providers: [AvcService],
  exports: [AvcService],
})
export class AvcModule {}
