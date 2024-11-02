import { Test, TestingModule } from '@nestjs/testing';
import { RootController } from "./root.controller";
import { RootModule } from "./root.module";
import { ConfigService } from "@nestjs/config";

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
