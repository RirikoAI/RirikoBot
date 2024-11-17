// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import AiCommand from './ai.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { Guild, TextChannel, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SystemPrompt } from '#command/ai/system-prompt';
import { SharedServicesMock } from "../../../test/mocks/shared-services.mock";

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
    config: {} as ConfigService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    autoVoiceChannelService: {} as any,
    guildRepository: {} as any,
    voiceChannelRepository: {} as any,
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

      command.streamToChannel = jest.fn();

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith('Thinking...');
      expect(command.streamToChannel).toHaveBeenCalledWith(
        undefined,
        mockUser.id,
        mockTextChannel.id,
        expect.any(Object),
      );
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

      command.streamToChannel = jest.fn();

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith('Thinking...');
      expect(command.streamToChannel).toHaveBeenCalledWith(
        'test prompt',
        mockUser.id,
        mockTextChannel.id,
        expect.any(Object),
      );
    });
  });

  describe('storePrompt', () => {
    it('should store the prompt for a new user', () => {
      const userId = '1234567890';
      const prompt = { role: 'user', content: 'test prompt' };

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
      const prompt1 = { role: 'user', content: 'test prompt 1' };
      const prompt2 = { role: 'user', content: 'test prompt 2' };

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
      const prompt = { role: 'user', content: 'test prompt' };

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
});
