import { Test, TestingModule } from '@nestjs/testing';
import { EconomyService } from './economy.service';
import { DatabaseService } from '#database/database.service';
import { DiscordService } from '#discord/discord.service';
import { EconomyExtensions } from '#economy/economy.module';
import { ResponseDto } from '#api/response.dto';
import { HttpStatus } from '@nestjs/common';
import { DiscordMessage } from '#command/command.types';

describe('EconomyService', () => {
  let economyService: EconomyService;
  let mockDatabaseService: DatabaseService;
  let mockEconomyExtensions: EconomyExtensions;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EconomyService,
        {
          provide: DatabaseService,
          useValue: {
            userRepository: {
              count: jest.fn(),
            },
          },
        },
        {
          provide: DiscordService,
          useValue: {},
        },
        {
          provide: 'ECONOMY_EXTENSIONS',
          useValue: {
            coins: {
              getBalance: jest.fn(),
              deductBalance: jest.fn(),
              addBalance: jest.fn(),
            },
            profile: {
              getProfile: jest.fn(),
              getUser: jest.fn(),
              setBackgroundImageURL: jest.fn(),
            },
            karma: {
              rewardUserForMessage: jest.fn(),
            },
            items: {
              findRandomItems: jest.fn(),
            },
          },
        },
        {
          provide: 'ECONOMY_SERVICES',
          useValue: {},
        },
      ],
    }).compile();

    economyService = module.get<EconomyService>(EconomyService);
    mockDatabaseService = module.get<DatabaseService>(DatabaseService);
    mockEconomyExtensions = module.get<EconomyExtensions>('ECONOMY_EXTENSIONS');
  });

  it('should be defined', () => {
    expect(economyService).toBeDefined();
  });

  it('should return economy root data', async () => {
    jest
      .spyOn(mockDatabaseService.userRepository, 'count')
      .mockResolvedValue(100);

    const result: ResponseDto = await economyService.getEconomyRoot();

    expect(result).toEqual({
      data: 'Ririko is serving 100 users.',
      success: true,
      statusCode: HttpStatus.OK,
    });
    expect(mockDatabaseService.userRepository.count).toHaveBeenCalled();
  });

  it('should handle message and reward user', async () => {
    const mockMessage: DiscordMessage = {
      author: { id: '123' },
      guild: { id: '456' },
    } as any;

    await economyService.handleMessage(mockMessage);

    expect(
      mockEconomyExtensions.karma.rewardUserForMessage,
    ).toHaveBeenCalledWith(mockMessage);
    expect(mockEconomyExtensions.items.findRandomItems).toHaveBeenCalledWith(
      mockMessage.author,
      mockMessage.guild,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
