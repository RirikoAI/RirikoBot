import { Test, TestingModule } from '@nestjs/testing';
import { JweService } from './jwe.service';

describe('JweService', () => {
  let service: JweService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JweService],
    }).compile();

    service = module.get<JweService>(JweService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
