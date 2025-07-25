import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SeedModule } from '#database/seeds/seed.module';

describe('RootService', () => {
  let seedModule: SeedModule;

  beforeEach(async () => {
    // Set environment variables for testing
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_TYPE = 'better-sqlite3';
    process.env.DATABASE_NAME = 'test.db';

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true, // Ignore the .env file
        }),
        SeedModule,
      ],
    }).compile();

    seedModule = module.get<SeedModule>(SeedModule);
  });

  it('should be defined', () => {
    expect(seedModule).toBeDefined();
  });
});
