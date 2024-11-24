import { Test, TestingModule } from '@nestjs/testing';
import CreateCommand from './create.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, GuildMember, TextChannel } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';

describe('CreateCommand', () => {
  let command: CreateCommand;
  let mockGuild: Guild;
  let mockGuildMember: GuildMember;
  let mockTextChannel: TextChannel;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
      giveaways: {
        start: jest.fn(),
      },
    },
  };
  const mockCommandService = {
    getGuildPrefix: jest.fn().mockResolvedValue('!'),
  };
  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    db: {
      guildRepository: {
        upsert: jest.fn(),
      } as any,
      voiceChannelRepository: {} as any,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CreateCommand,
          useValue: new CreateCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<CreateCommand>(CreateCommand);

    mockGuildMember = {
      permissions: {
        has: jest.fn().mockReturnValue(true),
      },
      displayAvatarURL: jest.fn().mockReturnValue('http://wwww.example.com'),
      hasPermission: jest.fn().mockReturnValue(true),
      user: {
        id: '1234567890',
        tag: 'Test User',
      },
    } as unknown as GuildMember;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;

    mockTextChannel = {
      id: '0987654321',
      name: 'test-channel',
      send: jest.fn(),
      createMessageCollector: jest.fn().mockReturnValue({
        on: jest.fn(),
        stop: jest.fn(),
      }),
    } as unknown as TextChannel;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should create a giveaway with valid inputs', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway create',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      jest.spyOn(command, 'createGiveaway').mockImplementation(async () => {});

      await command.runPrefix(mockMessage);

      expect(command.createGiveaway).toHaveBeenCalledWith(mockMessage);
    });
  });

  describe('runSlash', () => {
    it('should create a giveaway with valid inputs', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getString: jest
            .fn()
            .mockReturnValueOnce('prize')
            .mockReturnValueOnce('1d'),
          getInteger: jest.fn().mockReturnValue(1),
          getChannel: jest.fn().mockReturnValue(mockTextChannel),
        },
        channel: {
          send: jest.fn(),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command, 'validateInputs').mockReturnValue(true);

      await command.runSlash(mockInteraction);

      expect(mockDiscordService.client.giveaways.start).toHaveBeenCalledWith(
        mockTextChannel,
        {
          duration: expect.any(Number),
          winnerCount: 1,
          prize: 'prize',
        },
      );
    });
  });

  describe('validateInputs', () => {
    it('should return false for invalid prize length', () => {
      const mockInteraction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const result = command.validateInputs(
        'a'.repeat(257),
        1,
        '1d',
        mockTextChannel,
        mockInteraction,
      );

      expect(result).toBe(false);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'The prize name is too long. Please provide a shorter name.',
      );
    });

    it('should return false for invalid winners count', () => {
      const mockInteraction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const result = command.validateInputs(
        'prize',
        0,
        '1d',
        mockTextChannel,
        mockInteraction,
      );

      expect(result).toBe(false);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Please provide a valid number of winners.',
      );
    });

    it('should return false for invalid duration format', () => {
      const mockInteraction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const result = command.validateInputs(
        'prize',
        1,
        'invalid',
        mockTextChannel,
        mockInteraction,
      );

      expect(result).toBe(false);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Please provide a valid duration. You can use the following format: 1d, 1h, 1m, 1s.',
      );
    });

    it('should return false for invalid channel', () => {
      const mockInteraction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const result = command.validateInputs(
        'prize',
        1,
        '1d',
        null,
        mockInteraction,
      );

      expect(result).toBe(false);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Please mention a valid channel.',
      );
    });

    it('should return true for valid inputs', () => {
      const mockInteraction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const result = command.validateInputs(
        'prize',
        1,
        '1d',
        mockTextChannel,
        mockInteraction,
      );

      expect(result).toBe(true);
      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });
  });

  describe('createGiveaway', () => {
    it('should send embed messages and start giveaway', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway create',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      jest.spyOn(command, 'sendEmbed').mockImplementation(async () => {});
      jest
        .spyOn(command, 'sendGiveawayCreatedEmbed')
        .mockImplementation(async () => {});
      (jest as any)
        .spyOn(command.client.giveaways, 'start')
        .mockImplementation(async () => {});

      await command.createGiveaway(mockMessage);

      expect(command.sendEmbed).toHaveBeenCalled();
      expect(command.sendGiveawayCreatedEmbed).toBeDefined();
      expect(command.client.giveaways.start).toBeDefined();
    });
  });

  describe('sendEmbed', () => {
    it('should send an embed message', async () => {
      const mockMessage = {
        channel: {
          send: jest.fn(),
        },
        author: {
          tag: 'Test User',
        },
        member: {
          displayAvatarURL: jest.fn().mockReturnValue('http://example.com'),
        },
      } as unknown as DiscordMessage;

      await command.sendEmbed('Title', 'Description', mockMessage);

      expect(mockMessage.channel.send).toBeDefined();
    });
  });

  describe('sendGiveawayCreatedEmbed', () => {
    it('should send a giveaway created embed message', async () => {
      const mockMessage = {
        channel: {
          send: jest.fn(),
        },
        member: {
          user: {
            tag: 'Test User',
          },
          displayAvatarURL: jest.fn().mockReturnValue('http://example.com'),
        },
      } as unknown as DiscordMessage;

      await command.sendGiveawayCreatedEmbed('prize', 1, '1d', mockMessage);

      expect(mockMessage.channel.send).toBeDefined();
    });
  });

  describe('validatePrize', () => {
    it('should return false for prize name longer than 256 characters', () => {
      const mockMessage = { reply: jest.fn() } as unknown as DiscordMessage;
      const result = command.validatePrize('a'.repeat(257), mockMessage);
      expect(result).toBe(false);
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'The prize name is too long. Please provide a shorter name.',
      );
    });

    it('should return true for valid prize name', () => {
      const mockMessage = { reply: jest.fn() } as unknown as DiscordMessage;
      const result = command.validatePrize('Valid Prize', mockMessage);
      expect(result).toBe(true);
      expect(mockMessage.reply).not.toHaveBeenCalled();
    });
  });

  describe('validateWinners', () => {
    it('should return false for invalid number of winners', () => {
      const mockMessage = { reply: jest.fn() } as unknown as DiscordMessage;
      const result = command.validateWinners('0', mockMessage);
      expect(result).toBe(false);
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Please provide a valid number of winners.',
      );
    });

    it('should return true for valid number of winners', () => {
      const mockMessage = { reply: jest.fn() } as unknown as DiscordMessage;
      const result = command.validateWinners('1', mockMessage);
      expect(result).toBe(true);
      expect(mockMessage.reply).not.toHaveBeenCalled();
    });
  });

  describe('validateDuration', () => {
    it('should return false for invalid duration format', () => {
      const mockMessage = { reply: jest.fn() } as unknown as DiscordMessage;
      const result = command.validateDuration('invalid', mockMessage);
      expect(result).toBe(false);
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Please provide a valid duration. You can use the following format: 1d, 1h, 1m, 1s.',
      );
    });

    it('should return true for valid duration format', () => {
      const mockMessage = { reply: jest.fn() } as unknown as DiscordMessage;
      const result = command.validateDuration('1d', mockMessage);
      expect(result).toBe(true);
      expect(mockMessage.reply).not.toHaveBeenCalled();
    });
  });

  describe('validateChannel', () => {
    it('should return false for invalid channel mention', () => {
      const mockMessage = { reply: jest.fn() } as unknown as DiscordMessage;
      const mockM = {
        mentions: { channels: { first: jest.fn().mockReturnValue(null) } },
      };
      const result = command.validateChannel(mockM, mockMessage);
      expect(result).toBe(false);
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Please mention a valid channel.',
      );
    });

    it('should return true for valid channel mention', () => {
      const mockMessage = { reply: jest.fn() } as unknown as DiscordMessage;
      const mockM = {
        mentions: { channels: { first: jest.fn().mockReturnValue({}) } },
      };
      const result = command.validateChannel(mockM, mockMessage);
      expect(result).toBe(true);
      expect(mockMessage.reply).not.toHaveBeenCalled();
    });
  });
});
