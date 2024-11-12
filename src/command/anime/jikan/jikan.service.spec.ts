import { Test, TestingModule } from '@nestjs/testing';
import { JikanService } from './jikan.service';
import { JikanApi } from './jikan-api';

jest.mock('./jikan-api');

describe('JikanService', () => {
  let service: JikanService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JikanService, JikanApi],
    }).compile();

    service = module.get<JikanService>(JikanService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
