// src/config/app.config.spec.ts
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import appConfig from './app.config';

describe('AppConfig', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    // Clear process.env before setting up the testing module
    process.env = {};

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [appConfig],
          ignoreEnvFile: true,
        }),
      ],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
  });

  it('should validate and parse the app configuration with default values', () => {
    const config = configService.get('app');

    expect(config).toEqual({
      backendDomain: expect.any(String),
      fallbackLanguage: expect.any(String),
      frontendDomain: undefined,
      name: expect.any(String),
      workingDirectory: expect.any(String),
      nodeEnv: expect.any(String),
      port: expect.any(Number),
      headerLanguage: expect.any(String),
    });
  });
});
