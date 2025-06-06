import { NestFactory } from '@nestjs/core';
import { AppModule } from '#app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';
import { DiscordService } from '#discord/discord.service';
import { CommandService } from '#command/command.service';
import { ConfigService } from '@nestjs/config';
import { CliService } from '#cli/cli.service';

/**
 * Main function to bootstrap RiriKo AI
 * @author Earnest Angel (https://angel.net.my)
 */
export async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableVersioning();
  const configService = app.get(ConfigService);
  const discordService = app.get(DiscordService);
  const commandService = app.get(CommandService);
  const cliService = app.get(CliService);

  const documentFactory = () =>
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Ririko AI')
        .setDescription('Ririko AI Backend API')
        .setVersion('1.0.0')
        .build(),
    );
  SwaggerModule.setup('docs', app, documentFactory);

  await app.listen(configService.get('app.port'), '0.0.0.0', async () => {
    await discordService.connect();
    discordService.registerEvents();
    await commandService.registerInteractionCommands();
    Logger.log(
      `Server listening on port ${configService.get('app.port')}`,
      'Ririko Main',
    );
    await cliService.start();
  });
}

bootstrap();

process.on('uncaughtException', (error) => {
  Logger.error(`Uncaught Exception => ${error.message}`, error.stack);
});
