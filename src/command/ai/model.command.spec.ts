import { TestingModule, Test } from '@nestjs/testing';
import ModelCommand from './model.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, TextChannel, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';
import ollama from 'ollama';

describe('ModelCommand', () => {
  let command: ModelCommand;
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
          provide: ModelCommand,
          useValue: new ModelCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<ModelCommand>(ModelCommand);

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

  describe('runPrefix', () => {
    it('should reply with "Please provide a model" if no parameters are provided', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        content: 'model set',
        reply: jest.fn(),
        channel: mockTextChannel,
      } as unknown as DiscordMessage;

      command.params = ['set'];
      command.allParams = '';

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should reply with "Model set to: testModel" if model is set successfully', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        content: 'model set testModel',
        reply: jest.fn(),
        channel: mockTextChannel,
      } as unknown as DiscordMessage;

      command.params = ['set'];
      command.allParams = 'testModel';
      command.setModel = jest.fn().mockResolvedValue(true);

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should reply with "Failed to set model" if model setting fails', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        content: 'model set testModel',
        reply: jest.fn(),
        channel: mockTextChannel,
      } as unknown as DiscordMessage;

      command.params = ['set'];
      command.allParams = 'testModel';
      command.setModel = jest.fn().mockResolvedValue(null);

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should reply with "Pulling model..." and update status', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        content: 'model pull',
        reply: jest.fn().mockResolvedValue({ edit: jest.fn() }),
        channel: mockTextChannel,
      } as unknown as DiscordMessage;

      command.params = ['pull'];
      command.pullModel = jest
        .fn()
        .mockResolvedValue([
          { status: 'Downloading' },
          { status: 'Completed' },
        ]);

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith('Pulling model...');
    });
  });

  describe('runPrefix', () => {
    it('should reply with "Please provide a model" if no parameters are provided', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        content: 'model set',
        reply: jest.fn(),
        channel: mockTextChannel,
      } as unknown as DiscordMessage;

      command.params = ['set'];
      command.allParams = '';

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalled();
    });

    it('should reply with "Model set to: testModel" if model is set successfully', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        options: {
          getSubcommand: jest.fn().mockReturnValue('set'),
          getString: jest.fn().mockReturnValue('testModel'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      command.setModel = jest.fn().mockResolvedValue(true);

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should defer reply and update status', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        options: {
          getSubcommand: jest.fn().mockReturnValue('pull'),
        },
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as unknown as DiscordInteraction;

      command.pullModel = jest
        .fn()
        .mockResolvedValue([
          { status: 'Downloading' },
          { status: 'Completed' },
        ]);

      await command.runSlash(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        'Status: Downloading',
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        'Status: Completed',
      );
    });
  });

  describe('setModel', () => {
    it('should save the model to the database', async () => {
      const mockGuild = { id: '1234567890' };
      const mockModel = 'testModel';
      const mockGuildDB = {
        configurations: [],
      };
      command.db = {
        guildRepository: {
          findOne: jest.fn().mockResolvedValue(mockGuildDB),
        },
        guildConfigRepository: {
          save: jest.fn(),
        },
      } as any;

      await command.setModel(mockGuild, mockModel);

      expect(command.db.guildRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockGuild.id },
      });
      expect(command.db.guildConfigRepository.save).toHaveBeenCalledWith({
        name: 'ai_model',
        value: mockModel,
        guild: mockGuildDB,
      });
    });
  });

  describe('pullModel', () => {
    it('should pull the model from the database', async () => {
      const mockGuildId = '1234567890';
      const mockGuildDB = {
        configurations: [{ name: 'ai_model', value: 'testModel' }],
      };
      command.db = {
        guildRepository: {
          findOne: jest.fn().mockResolvedValue(mockGuildDB),
        },
      } as any;

      const mockResponse = [{ status: 'Downloading' }, { status: 'Completed' }];
      jest.spyOn(ollama, 'pull').mockResolvedValue(mockResponse as any);

      const response = await command.pullModel(mockGuildId);

      expect(command.db.guildRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockGuildId },
      });
      expect(ollama.pull).toHaveBeenCalledWith({
        model: 'testModel',
        stream: true,
      });
      expect(response).toEqual(mockResponse);
    });
  });
});
