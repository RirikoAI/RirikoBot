import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from '#app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DiscordService } from '#discord/discord.service';
import { CommandService } from '#command/command.service';
import { ConfigService } from '@nestjs/config';
import { CliService } from '#cli/cli.service';
import validationOptions from '#util/entities/validation-option';
import { useContainer } from 'class-validator';
import session from 'express-session';
import { JwksService } from '#jwks/jwks.service';

/**
 * Main function to bootstrap RiriKo AI
 * @author Earnest Angel (https://angel.net.my)
 */
export async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const allowedOrigins = [
    config.get('app.frontendURL'),
    config.get('app.backendURL'),
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  // Generate JWKS
  const jwksService = app.get(JwksService);
  await jwksService.generateJwks();

  app.use(
    session({
      secret: config.get('auth.secret'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 3600000 * 24,
      },
    }),
  );

  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  app.useGlobalPipes(new ValidationPipe(validationOptions));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.enableVersioning({
    type: VersioningType.URI,
  });

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
        .addBearerAuth()
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
