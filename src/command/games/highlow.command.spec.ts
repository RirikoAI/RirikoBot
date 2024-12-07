import { Test, TestingModule } from '@nestjs/testing';
import HighLowCommand from './highlow.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';

describe('HighLowCommand', () => {
  let command: HighLowCommand;
  let mockGuild: Guild;
  let mockUser: User;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
    },
  };
  const mockCommandService = {
    getGuildPrefix: jest.fn(),
  };
  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    autoVoiceChannelService: {} as any,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: HighLowCommand,
          useValue: new HighLowCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<HighLowCommand>(HighLowCommand);

    mockUser = {
      id: '1234567890',
      username: 'TestUser',
      displayAvatarURL: jest.fn().mockReturnValue('http://avatar.url'),
    } as unknown as User;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with the high-low game prompt', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
        channel: {
          createMessageCollector: jest.fn().mockReturnValue({
            on: jest.fn(),
          }),
        },
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should handle higher guess correctly', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
        channel: {
          createMessageCollector: jest
            .fn()
            .mockImplementation(({ filter, time, max }) => {
              return {
                on: (event, callback) => {
                  if (event === 'collect') {
                    callback({
                      content: 'higher',
                      author: mockUser,
                      reply: jest.fn(),
                    });
                  }
                },
              };
            }),
        },
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledTimes(1);
    });

    it('should handle lower guess correctly', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
        channel: {
          createMessageCollector: jest
            .fn()
            .mockImplementation(({ filter, time, max }) => {
              return {
                on: (event, callback) => {
                  if (event === 'collect') {
                    callback({
                      content: 'lower',
                      author: mockUser,
                      reply: jest.fn(),
                    });
                  }
                },
              };
            }),
        },
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledTimes(1);
    });

    it('should handle timeout correctly', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        reply: jest.fn(),
        channel: {
          createMessageCollector: jest
            .fn()
            .mockImplementation(({ filter, time, max }) => {
              return {
                on: (event, callback) => {
                  if (event === 'end') {
                    callback([], 'time');
                  }
                },
              };
            }),
        },
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledTimes(2);
    });
  });

  describe('runSlash', () => {
    it('should reply with the high-low game prompt', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        reply: jest.fn(),
        channel: {
          createMessageCollector: jest.fn().mockReturnValue({
            on: jest.fn(),
          }),
        },
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should handle higher guess correctly', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        reply: jest.fn(),
        channel: {
          createMessageCollector: jest
            .fn()
            .mockImplementation(({ filter, time, max }) => {
              return {
                on: (event, callback) => {
                  if (event === 'collect') {
                    callback({
                      content: 'higher',
                      author: mockUser,
                      reply: jest.fn(),
                    });
                  }
                },
              };
            }),
        },
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
    });

    it('should handle lower guess correctly', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        reply: jest.fn(),
        channel: {
          createMessageCollector: jest
            .fn()
            .mockImplementation(({ filter, time, max }) => {
              return {
                on: (event, callback) => {
                  if (event === 'collect') {
                    callback({
                      content: 'lower',
                      author: mockUser,
                      reply: jest.fn(),
                    });
                  }
                },
              };
            }),
        },
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
    });

    it('should handle timeout correctly', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        reply: jest.fn(),
        channel: {
          createMessageCollector: jest
            .fn()
            .mockImplementation(({ filter, time, max }) => {
              return {
                on: (event, callback) => {
                  if (event === 'end') {
                    callback([], 'time');
                  }
                },
              };
            }),
        },
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledTimes(2);
    });
  });
});
