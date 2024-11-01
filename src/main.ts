import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ConfigService } from "./config/config.service";
import { Logger } from "@nestjs/common";
import { DiscordService } from "./discord/discord.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const discordService = app.get(DiscordService);
  
  const documentFactory = () => SwaggerModule.createDocument(app, config.getSwaggerConfig());
  SwaggerModule.setup('docs', app, documentFactory);
  
  await app.listen(config.apiPort, async () => {
    Logger.log(`Server listening on port ${config.apiPort}`);
    Logger.log(`Bot invite link: ${config.getBotInviteLink()}`);
    const client = await discordService.connect();
  });
}

bootstrap();
