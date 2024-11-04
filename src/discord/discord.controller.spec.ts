import { Test, TestingModule } from '@nestjs/testing';
import { DiscordController } from './discord.controller';
import { DiscordService } from './discord.service';
import { ConfigService } from '@nestjs/config';

describe('Discord Controller', () => {
  let controller: DiscordController;
  
  // Mock all used services in the controller
  const discordServiceMock = { get: jest.fn() };
  const configServiceMock = { get: jest.fn() };
  
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DiscordService,
          useValue: discordServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
      exports: [DiscordService],
      controllers: [DiscordController],
    }).compile();

    controller = module.get<DiscordController>(DiscordController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
