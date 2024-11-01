import { Module } from '@nestjs/common';
import { RootController } from './api/root.controller';
import { RootService } from './api/root.service';
import { ConfigService } from './config/config.service';
import { DiscordModule } from './discord/discord.module';
import { DiscordController } from './discord/discord.controller';

@Module({
  imports: [DiscordModule],
  controllers: [RootController, DiscordController],
  providers: [RootService, ConfigService, DiscordModule],
})
export class AppModule {}
