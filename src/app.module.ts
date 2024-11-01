import { Module } from '@nestjs/common';
import { RootController } from './api/root.controller';
import { RootService } from './api/root.service';
import { ConfigService } from './config/config.service';
import { DiscordModule } from './discord/discord.module';
import { DiscordController } from './discord/discord.controller';
import { DiscordService } from "./discord/discord.service";
import { RootModule } from "./api/root.module";

@Module({
  imports: [RootModule, DiscordModule],
  controllers: [RootController, DiscordController],
  providers: [RootService, ConfigService, DiscordService],
})
export class AppModule {}
