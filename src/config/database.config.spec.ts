import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import databaseConfig from './database.config';

// Mock dotenv to prevent loading .env file
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('#util/config/config-validator.util');

describe('DatabaseConfig', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    // Clear process.env before setting up the testing module
    process.env = {};

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [databaseConfig],
          ignoreEnvFile: true,
        }),
      ],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
  });

  it('should validate and parse the database configuration', () => {
    const mockEnv = {
      DATABASE_LOGGING: 'true',
      DATABASE_URL: 'postgres://user:password@localhost:5432/dbname',
      DATABASE_TYPE: 'postgres',
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5432',
      DATABASE_PASSWORD: 'password',
      DATABASE_NAME: 'dbname',
      DATABASE_USERNAME: 'user',
      DATABASE_SYNCHRONIZE: 'true',
      DATABASE_MAX_CONNECTIONS: '100',
      DATABASE_SSL_ENABLED: 'true',
      DATABASE_REJECT_UNAUTHORIZED: 'true',
      DATABASE_CA: 'ca-cert',
      DATABASE_KEY: 'key-cert',
      DATABASE_CERT: 'cert',
    };

    // Set mock environment variables
    process.env = { ...mockEnv };

    const config = configService.get('database');

    expect(config).toEqual(config);
  });
});
