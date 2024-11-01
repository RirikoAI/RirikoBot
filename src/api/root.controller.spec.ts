import { Test, TestingModule } from '@nestjs/testing';
import { RootService } from './root.service';
import { RootController } from "./root.controller";
import { ConfigService } from "../config/config.service";
import { RootModule } from "./root.module";

describe('RootService', () => {
  let service: RootService;
  
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      
      imports: [RootModule],
      providers: [ConfigService],
      controllers: [RootController],
    }).compile();
    
    service = module.get<RootService>(RootService);
  });
  
  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
