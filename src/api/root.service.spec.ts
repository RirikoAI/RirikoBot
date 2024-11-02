import { Test, TestingModule } from '@nestjs/testing';
import { RootController } from "./root.controller";
import { ConfigService } from "../config/config.service";
import { RootModule } from "./root.module";

describe('RootService', () => {
  let controller: RootController;
  
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [RootModule],
      providers: [ConfigService],
      controllers: [RootController],
    }).compile();
    
    controller = module.get<RootController>(RootController);
  });
  
  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
