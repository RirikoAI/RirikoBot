import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module';
import { runSeed } from './run-seed';

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn().mockResolvedValue({
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('runSeed', () => {
  it('should create the app and close it', async () => {
    await runSeed();

    expect(NestFactory.create).toHaveBeenCalledWith(SeedModule);
    const app = await NestFactory.create(SeedModule);
    expect(app.close).toHaveBeenCalled();
  });
});
