import { Test, TestingModule } from '@nestjs/testing';
import { CommandService } from './command.service';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '#discord/discord.service';
import { fakeLogger } from '../../test/helper/fake-logger.helper';
import { SharedServicesMock } from "../../test/mocks/shared-services.mock";

describe('CommandService', () => {
  let service: CommandService;
  let discordServiceMock: jest.Mocked<DiscordService>;
  let configServiceMock: jest.Mocked<ConfigService>;
  let sharedServicesMock: jest.Mocked<SharedServicesMock>;
  let app;

  const putTest = () => {};

  beforeEach(async () => {
    discordServiceMock = {
      client: {
        // Mock the client methods used in CommandService
        api: {
          applications: {
            commands: {
              post: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
        restClient: {
          put: putTest,
        },
      },
    } as any;

    configServiceMock = {
      get: jest.fn().mockReturnValue('!'),
    } as any;

    sharedServicesMock = {
      guildRepository: {
        findOne: jest.fn().mockResolvedValue({ prefix: '!' }),
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommandService,
        {
          provide: DiscordService,
          useValue: discordServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: 'SHARED_SERVICES',
          useValue: sharedServicesMock,
        },
      ],
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

  it('should check and execute prefix command', async () => {
    const message = {
      content: '!test',
      guild: { id: '123' },
      reply: jest.fn(),
    } as any;

    await service.checkPrefixCommand(message);
    expect(sharedServicesMock.guildRepository.findOne).toHaveBeenCalledWith({
      where: { id: '123' },
    });
  });

  it('should register, check and execute slash command', async () => {
    const interaction = {
      commandName: 'ping',
      reply: jest.fn(),
      options: {
        getString: jest.fn(),
      },
    } as any;

    await service.registerCommands();
    await service.checkSlashCommand(interaction);
    expect(interaction.reply).toHaveBeenCalled();
  });

  afterAll(async () => {
    await app.close();
  });
});
