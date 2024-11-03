import { Test, TestingModule } from '@nestjs/testing';
import { CommandService } from './command.service';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '#discord/discord.service';
import { fakeLogger } from '../../test/helper/fake-logger.helper';

describe('CommandService', () => {
  let service: CommandService;
  let app;

  // Mock all available services that are provided to commands in here
  const discordServiceMock = { get: jest.fn() };
  const configServiceMock = { get: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommandService,
        // Mock services for all commands
        {
          provide: DiscordService,
          useValue: discordServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
      exports: [CommandService],
    }).compile();

    app = module.createNestApplication({
      // @ts-ignore
      logger: {
        log: fakeLogger,
      },
    });

    await app.init();

    service = module.get<CommandService>(CommandService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should be able to register all commands', () => {
    expect(service.registerCommands()).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });
});
