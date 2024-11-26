import { Test, TestingModule } from '@nestjs/testing';
import { EconomyService } from './economy.service';
import { EconomyController } from './economy.controller';
import { EconomyModule } from './economy.module';
import { ConfigService } from '@nestjs/config';

describe('EconomyService', () => {
  let service: EconomyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [EconomyModule],
      providers: [ConfigService],
      controllers: [EconomyController],
    }).compile();

    service = module.get<EconomyService>(EconomyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
