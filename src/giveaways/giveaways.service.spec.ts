import { Test, TestingModule } from '@nestjs/testing';
import { GiveawaysService } from './giveaways.service';
import { DiscordClient } from '#discord/discord.client';

// Mock the GiveawaysManager class
jest.mock('discord-giveaways', () => {
  return {
    GiveawaysManager: jest.fn().mockImplementation(() => {
      return {
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn(),
        // Add other necessary methods and properties for the mock
      };
    }),
  };
});

describe('GiveawaysService', () => {
  let giveawaysService: GiveawaysService;
  let mockDiscordClient: DiscordClient;

  beforeEach(async () => {
    mockDiscordClient = {
      user: { id: '1234567890' },
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
      // Add other necessary properties and methods for the mock
    } as unknown as DiscordClient;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GiveawaysService,
        {
          provide: DiscordClient,
          useValue: mockDiscordClient,
        },
      ],
    }).compile();

    giveawaysService = module.get<GiveawaysService>(GiveawaysService);
  });

  it('should be defined', () => {
    expect(giveawaysService).toBeDefined();
  });

  it('should register and return a GiveawaysManager', () => {
    const manager = giveawaysService.register(mockDiscordClient);

    expect(manager).toBeDefined();
    expect(giveawaysService.manager).toBe(manager);
  });
});
