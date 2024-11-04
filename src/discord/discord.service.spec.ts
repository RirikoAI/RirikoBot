import { Test, TestingModule } from '@nestjs/testing';
import { DiscordController } from './discord.controller';
import { DiscordService } from './discord.service';
import { ConfigService } from '@nestjs/config';
import { CommandService } from "#command/command.service";

describe('Discord Service', () => {
  let service: DiscordService;

  // Mock all available services used by the Discord Service
  const configServiceMock = { get: jest.fn() };
  const commandServiceMock = { get: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: CommandService,
          useValue: commandServiceMock,
        },
      ],
      exports: [DiscordService],
      controllers: [DiscordController],
    }).compile();

    service = module.get<DiscordService>(DiscordService);
  });

  it('service should be defined', () => {
    expect(service).toBeDefined();
  });
});
