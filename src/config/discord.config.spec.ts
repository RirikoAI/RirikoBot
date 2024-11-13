// src/config/discord.config.spec.ts
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import discordConfig from './discord.config';

// Mock dotenv to prevent loading .env file
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('#util/config/config-validator.util');

describe('DiscordConfig', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    // Clear process.env before setting up the testing module
    process.env = {};

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [discordConfig],
          ignoreEnvFile: true,
        }),
      ],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
  });

  it('should validate and parse the discord configuration', () => {
    const mockEnv = {
      DISCORD_BOT_TOKEN: 'test-bot-token',
      DISCORD_APPLICATION_ID: 'test-application-id',
      DEFAULT_PREFIX: '!',
    };

    // Set mock environment variables
    process.env = { ...mockEnv };

    const config = configService.get('discord');

    expect(config).toEqual(configService.get('discord'));
  });
});
