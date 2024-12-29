import { Test, TestingModule } from '@nestjs/testing';
import AiCommand from './ai.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, TextChannel, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SystemPrompt } from '#command/ai/system-prompt';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';
import ollama from 'ollama';

describe('AiCommand', () => {
  let command: AiCommand;
  let mockGuild: Guild;
  let mockUser: User;
  let mockTextChannel: TextChannel;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
      channels: {
        cache: {
          get: jest.fn(),
        },
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: AiCommand,
          useValue: new AiCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<AiCommand>(AiCommand);

    mockUser = {
      id: '1234567890',
      username: 'TestUser',
      displayAvatarURL: jest.fn().mockReturnValue('http://avatar.url'),
    } as unknown as User;

    mockTextChannel = {
      id: '1234567890',
      send: jest.fn(),
      messages: {
        fetch: jest.fn(),
      },
    } as unknown as TextChannel;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with "Thinking..." and stream AI response', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        content: 'ai test prompt',
        reply: jest.fn().mockResolvedValue({
          id: 'replyId',
        }),
        channel: mockTextChannel,
      } as unknown as DiscordMessage;

      (command as any).streamToChannel = jest.fn();

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith('Thinking...');
      expect((command as any).streamToChannel).toHaveBeenCalled();
    });
  });

  describe('runSlash', () => {
    it('should reply with "Thinking..." and stream AI response', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        options: {
          getString: jest.fn().mockReturnValue('test prompt'),
        },
        reply: jest.fn().mockResolvedValue({
          id: 'replyId',
        }),
        fetchReply: jest.fn().mockResolvedValue({
          id: 'replyId',
        }),
        channel: mockTextChannel,
      } as unknown as DiscordInteraction;

      (command as any).streamToChannel = jest.fn();
      (command as any).db.guildRepository.findOne = jest
        .fn()
        .mockResolvedValue({
          configurations: [
            {
              name: 'ai_model',
              value: 'test model',
            },
          ],
        });

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith('Thinking...');
      expect((command as any).streamToChannel).toHaveBeenCalled();
    });
  });

  describe('storePrompt', () => {
    it('should store the prompt for a new user', () => {
      const userId = '1234567890';
      const prompt = { role: 'user', content: 'test prompt' } as any;

      command.storePrompt(userId, prompt);

      expect(command.userPrompts).toEqual([
        {
          userId,
          prompts: [prompt],
        },
      ]);
    });

    it('should store the prompt for an existing user', () => {
      const userId = '1234567890';
      const prompt1 = { role: 'user', content: 'test prompt 1' } as any;
      const prompt2 = { role: 'user', content: 'test prompt 2' } as any;

      command.storePrompt(userId, prompt1);
      command.storePrompt(userId, prompt2);

      expect(command.userPrompts).toEqual([
        {
          userId,
          prompts: [prompt1, prompt2],
        },
      ]);
    });
  });

  describe('getPrompts', () => {
    it('should return the prompts for a specific user', () => {
      const userId = '1234567890';
      const prompt = { role: 'user', content: 'test prompt' } as any;

      command.storePrompt(userId, prompt);

      const userPrompts = command.getPrompts(userId);

      expect(userPrompts).toEqual({
        userId,
        prompts: [prompt],
      });
    });

    it('should return undefined if no prompts are found for a specific user', () => {
      const userId = '1234567890';

      const userPrompts = command.getPrompts(userId);

      expect(userPrompts).toBeUndefined();
    });

    it('should return system prompts', () => {
      const prompts = SystemPrompt;
      expect(prompts).toBeDefined();
    });
  });

  describe('storePrompt', () => {
    it('should store the new prompt for a user', () => {
      const userId = '1234567890';
      const newMessages = { role: 'user', content: 'new test prompt' } as any;

      command.storePrompt(userId, newMessages);

      expect(command.userPrompts).toEqual([
        {
          userId,
          prompts: [newMessages],
        },
      ]);
    });
  });

  describe('streamToChannel', () => {
    it('should stream AI response to the channel', async () => {
      const prompt = 'test prompt';
      const userId = '1234567890';
      const userName = 'TestUser';
      const channelId = '1234567890';
      const firstReply = { id: 'replyId' } as any;

      const mockResponse = [
        { message: { content: 'part 1' } },
        { message: { content: 'part 2' } },
        { message: { content: 'part 3' } },
        { message: { content: 'part 4' } },
      ];
      command.client.channels.cache.get = jest
        .fn()
        .mockReturnValue(mockTextChannel);

      jest.spyOn(ollama, 'chat').mockResolvedValue(mockResponse as any);
      mockTextChannel.messages.fetch = jest.fn().mockResolvedValue(firstReply);
      mockTextChannel.send = jest.fn().mockResolvedValue(firstReply);
      firstReply.edit = jest.fn();

      await (command as any).streamToChannel(
        jest.fn() as any,
        prompt,
        userId,
        userName,
        channelId,
        firstReply,
      );

      expect(firstReply.edit).toHaveBeenCalledTimes(1);
      expect(firstReply.edit).toHaveBeenCalledWith('part 1part 2part 3part 4');
    });
  });
});
