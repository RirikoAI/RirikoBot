import { Test, TestingModule } from '@nestjs/testing';
import { SeedModule } from '#database/seeds/seed.module';

describe('RootService', () => {
  let seedModule: SeedModule;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [SeedModule],
    }).compile();

    seedModule = module.get<SeedModule>(SeedModule);
  });

  it('should be defined', () => {
    expect(seedModule).toBeDefined();
  });
});
