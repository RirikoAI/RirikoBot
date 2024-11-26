import { Test, TestingModule } from '@nestjs/testing';
import { EconomyController } from './economy.controller';
import { RootModule } from './root.module';
import { ConfigService } from '@nestjs/config';

describe('RootService', () => {
  let controller: EconomyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [RootModule],
      providers: [ConfigService],
      controllers: [EconomyController],
    }).compile();

    controller = module.get<EconomyController>(EconomyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getHello() should be defined', () => {
    expect(controller.getHello()).toBeDefined();
  });
});
