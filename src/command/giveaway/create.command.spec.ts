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
      giveawaysManager: {
        start: jest.fn().mockResolvedValue(undefined),
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
      displayAvatarURL: jest.fn().mockReturnValue('http://example.com'),
      hasPermission: jest.fn().mockReturnValue(true),
      user: {
        id: '1234567890',
        tag: 'Test User',
      },
      member: {
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
        author: mockGuildMember,
        content: '!giveaway create',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      jest.spyOn(command, 'createGiveaway').mockImplementation(async () => {});

      await command.runPrefix(mockMessage);

      expect(command.createGiveaway).toBeCalled();
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
            .mockReturnValueOnce('Prize')
            .mockReturnValueOnce('1d'),
          getInteger: jest.fn().mockReturnValue(1),
          getChannel: jest.fn().mockReturnValue(mockTextChannel),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest
        .spyOn(command, 'sendGiveawayCreatedEmbed')
        .mockImplementation(async () => {});

      await command.runSlash(mockInteraction);

      expect(command.sendGiveawayCreatedEmbed).toHaveBeenCalled();
      expect(
        mockDiscordService.client.giveawaysManager.start,
      ).toHaveBeenCalled();
    });

    it('should not create a giveaway with invalid inputs', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getString: jest
            .fn()
            .mockReturnValueOnce('Prize')
            .mockReturnValueOnce(null),
          getInteger: jest.fn().mockReturnValue(0),
          getChannel: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Please provide valid inputs.',
      );
    });
  });

  describe('createGiveaway', () => {
    it('should create a giveaway with valid inputs', async () => {
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

      const collector = {
        on: jest.fn((event, callback) => {
          if (event === 'collect') {
            callback({ content: 'Prize', author: { id: '1234567890' } });
            callback({ content: '1', author: { id: '1234567890' } });
            callback({ content: '1d', author: { id: '1234567890' } });
            callback({
              content: '<#0987654321>',
              author: { id: '1234567890' },
              mentions: {
                channels: { first: jest.fn().mockReturnValue(mockTextChannel) },
              },
            });
          }
        }),
        stop: jest.fn(),
      };

      mockTextChannel.createMessageCollector = jest
        .fn()
        .mockReturnValue(collector);

      await command.createGiveaway(mockMessage);

      expect(command.sendEmbed).toHaveBeenCalled();
      expect(command.sendGiveawayCreatedEmbed).toHaveBeenCalled();
      expect(
        mockDiscordService.client.giveawaysManager.start,
      ).toHaveBeenCalled();
    });

    it('should cancel giveaway creation on cancel command', async () => {
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

      const collector = {
        on: jest.fn((event, callback) => {
          if (event === 'collect') {
            callback({ content: 'cancel', author: { id: '1234567890' } });
          }
        }),
        stop: jest.fn(),
      };

      mockTextChannel.createMessageCollector = jest
        .fn()
        .mockReturnValue(collector);

      await command.createGiveaway(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Giveaway creation canceled.',
      );
      expect(collector.stop).toHaveBeenCalledWith('canceled');
    });
  });

  describe('sendEmbed', () => {
    it('should send an embed message', async () => {
      const mockMessage = {
        channel: mockTextChannel,
        member: mockGuildMember,
        author: mockGuildMember,
      } as unknown as DiscordMessage;

      await command.sendEmbed('Title', 'Description', mockMessage);

      expect(mockTextChannel.send).toHaveBeenCalled();
    });
  });

  describe('sendGiveawayCreatedEmbed', () => {
    it('should send a giveaway created embed message', async () => {
      const mockMessage = {
        channel: mockTextChannel,
        member: mockGuildMember,
      } as unknown as DiscordMessage;

      await command.sendGiveawayCreatedEmbed('Prize', 1, '1d', mockMessage);

      expect(mockTextChannel.send).toHaveBeenCalled();
    });
  });

  describe('validateInputs', () => {
    it('should validate inputs correctly', () => {
      const mockInteraction = {
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      const valid = command.validateInputs(
        'Prize',
        1,
        '1d',
        mockTextChannel,
        mockInteraction,
      );
      expect(valid).toBe(true);

      const invalidPrize = command.validateInputs(
        'P'.repeat(257),
        1,
        '1d',
        mockTextChannel,
        mockInteraction,
      );
      expect(invalidPrize).toBe(false);

      const invalidWinners = command.validateInputs(
        'Prize',
        0,
        '1d',
        mockTextChannel,
        mockInteraction,
      );
      expect(invalidWinners).toBe(false);

      const invalidDuration = command.validateInputs(
        'Prize',
        1,
        'invalid',
        mockTextChannel,
        mockInteraction,
      );
      expect(invalidDuration).toBe(false);

      const invalidChannel = command.validateInputs(
        'Prize',
        1,
        '1d',
        null,
        mockInteraction,
      );
      expect(invalidChannel).toBe(false);
    });
  });

  describe('validatePrize', () => {
    it('should validate prize correctly', () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const valid = command.validatePrize('Prize', mockMessage);
      expect(valid).toBe(true);

      const invalid = command.validatePrize('P'.repeat(257), mockMessage);
      expect(invalid).toBe(false);
    });
  });

  describe('validateWinners', () => {
    it('should validate winners correctly', () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const valid = command.validateWinners('1', mockMessage);
      expect(valid).toBe(true);

      const invalid = command.validateWinners('0', mockMessage);
      expect(invalid).toBe(false);
    });
  });

  describe('validateDuration', () => {
    it('should validate duration correctly', () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const valid = command.validateDuration('1d', mockMessage);
      expect(valid).toBe(true);

      const invalid = command.validateDuration('invalid', mockMessage);
      expect(invalid).toBe(false);
    });
  });

  describe('validateChannel', () => {
    it('should validate channel correctly', () => {
      const mockMessage = {
        reply: jest.fn(),
        mentions: {
          channels: {
            first: jest.fn().mockReturnValue(mockTextChannel),
          },
        },
      } as unknown as DiscordMessage;

      const valid = command.validateChannel(mockMessage, mockMessage);
      expect(valid).toBe(true);

      mockMessage.mentions.channels.first = jest.fn().mockReturnValue(null);
      const invalid = command.validateChannel(mockMessage, mockMessage);
      expect(invalid).toBe(false);
    });
  });
});
