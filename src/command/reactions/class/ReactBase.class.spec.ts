import { Test, TestingModule } from '@nestjs/testing';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import axios from 'axios';
import { ReactBase } from './ReactBase.class';
import { Guild, User } from 'discord.js';
import { SharedServicesMock, TestSharedService } from "../../../../test/mocks/shared-services.mock";

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
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
  };

class ConcreteReactCommand extends ReactBase {
  name = 'test';
  regex = /^test$/i;
  description = 'Test reaction command';
  category = 'reactions';
  usageExamples = ['test @user'];
  reactionType = 'test';
  content = 'tested on';
  noTargetContent = 'tested without a target';
}

describe('ReactBase', () => {
  let command: ConcreteReactCommand;
  let mockGuild: Guild;
  let mockUser: User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
          providers: [
            {
              provide: ConcreteReactCommand,
              useValue: new ConcreteReactCommand(mockSharedServices),
            },
          ],
        }).compile();
        
            command = module.get<ConcreteReactCommand>(ConcreteReactCommand);
    
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

  describe('runPrefix', () => {
    it('should send a reply with a target user', async () => {
      const mockMessage = {
        author: mockUser,
        guild: mockGuild,
        mentions: {
          users: {
            first: jest.fn().mockReturnValue({ id: '456', username: 'TargetUser' }),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockedAxios.get.mockResolvedValueOnce({ data: { url: 'http://test.gif' } });

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: '<@1234567890> tested on <@456>',
        embeds: [expect.any(Object)]
      });
    });

    it('should send a reply without a target user', async () => {
      const mockMessage = {
        author: mockUser,
        guild: mockGuild,
        mentions: {
          users: {
            first: jest.fn().mockReturnValue(null),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockedAxios.get.mockResolvedValueOnce({ data: { url: 'http://test.gif' } });

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: '<@1234567890> tested without a target',
        embeds: [expect.any(Object)]
      });
    });
  });

  describe('runSlash', () => {
    it('should send a reply with a target user', async () => {
      const mockInteraction = {
        user: mockUser,
        guild: mockGuild,
        options: {
          getUser: jest.fn().mockReturnValue({ id: '456', username: 'TargetUser' }),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockedAxios.get.mockResolvedValueOnce({ data: { url: 'http://test.gif' } });

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '<@1234567890> tested on <@456>',
        embeds: [expect.any(Object)]
      });
    });
  });
});
