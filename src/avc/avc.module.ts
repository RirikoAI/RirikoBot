import { forwardRef, Module } from '@nestjs/common';
import { AvcService } from '#avc/avc.service';
import { DiscordModule } from '#discord/discord.module';
import { DatabaseModule } from "#database/database.module";
import { DatabaseService } from "#database/database.service";

/**
 * @author Earnest Angel (https://angel.net.my)
 */
@Module({
  imports: [forwardRef(() => DiscordModule), DatabaseModule],
  providers: [AvcService, DatabaseService],
  exports: [AvcService],
})
export class AvcModule {}
