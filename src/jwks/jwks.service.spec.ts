import { Test, TestingModule } from '@nestjs/testing';
import { JwksService } from './jwks.service';

describe('JwksService', () => {
  let service: JwksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwksService],
    }).compile();

    service = module.get<JwksService>(JwksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
