import { Module } from '@nestjs/common';
import { RootController } from './api/root.controller';
import { RootService } from './api/root.service';
import { ConfigService } from './config/config.service';
import { DiscordModule } from './discord/discord.module';
import { DiscordService } from "./discord/discord.service";
import { RootModule } from "./api/root.module";
import { CommandModule } from "./command/command.module";

@Module({
  imports: [RootModule, DiscordModule, CommandModule],
  controllers: [RootController],
  providers: [RootService, ConfigService, DiscordService],
})
export class AppModule {}
