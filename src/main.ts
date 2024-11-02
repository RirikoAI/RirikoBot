import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from './config/config.service';
import { Logger } from '@nestjs/common';
import { DiscordService } from './discord/discord.service';
import { CommandService } from './command/command.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const discordService = app.get(DiscordService);
  const commandService = app.get(CommandService);

  const documentFactory = () =>
    SwaggerModule.createDocument(app, config.getSwaggerConfig());
  SwaggerModule.setup('docs', app, documentFactory);

  await app.listen(config.apiPort, async () => {
    Logger.log(`Server listening on port ${config.apiPort}`, 'Ririko Main');
    Logger.log(`Bot invite link: ${config.getBotInviteLink()}`, 'Ririko Main');
    const client = await discordService.connect();
    discordService.registerEvents(client);
    commandService.registerPrefixCommand(client);
  });
}

bootstrap();

process.on('uncaughtException', (error) => {
  Logger.error(`Uncaught Exception => ${error.message}`, error.stack);
});