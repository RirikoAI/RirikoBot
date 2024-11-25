import { Test, TestingModule } from '@nestjs/testing';
import RerollCommand from './reroll.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, GuildMember, TextChannel } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';

describe('RerollCommand', () => {
  let command: RerollCommand;
  let mockGuild: Guild;
  let mockGuildMember: GuildMember;
  let mockTextChannel: TextChannel;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
      giveawaysManager: {
        giveaways: [],
        reroll: jest.fn().mockResolvedValue(undefined), // Ensure reroll returns a resolved promise
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
          provide: RerollCommand,
          useValue: new RerollCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<RerollCommand>(RerollCommand);

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
    } as unknown as GuildMember;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;

    mockTextChannel = {
      id: '0987654321',
      name: 'test-channel',
      send: jest.fn(),
    } as unknown as TextChannel;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reroll a giveaway with valid message ID', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway reroll 1234567890',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      jest.spyOn(command, 'rerollGiveaway').mockImplementation(async () => {});

      await command.runPrefix(mockMessage);

      expect(command.rerollGiveaway).toBeCalled();
    });
  });

  describe('runSlash', () => {
    it('should reroll a giveaway with valid message ID', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getString: jest.fn().mockReturnValue('1234567890'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command, 'rerollGiveaway').mockImplementation(async () => {});

      await command.runSlash(mockInteraction);

      expect(command.rerollGiveaway).toHaveBeenCalledWith(
        mockInteraction,
        '1234567890',
      );
    });
  });

  describe('rerollGiveaway', () => {
    it('should send error message if no giveaway found', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway reroll 1234567890',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      jest
        .spyOn(command, 'sendErrorMessage')
        .mockImplementation(async () => {});

      await command.rerollGiveaway(mockMessage, '1234567890');

      expect(command.sendErrorMessage).toHaveBeenCalledWith(
        mockMessage,
        'No giveaway found for the message ID: 1234567890',
      );
    });

    it('should reroll the giveaway if found', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway reroll 1234567890',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const mockGiveaway = { messageId: '1234567890' };
      mockDiscordService.client.giveawaysManager.giveaways.push(mockGiveaway);

      await command.rerollGiveaway(mockMessage, '1234567890');

      expect(
        mockDiscordService.client.giveawaysManager.reroll,
      ).toHaveBeenCalledWith('1234567890');
      expect(mockMessage.reply).toHaveBeenCalledWith('Giveaway rerolled!');
    });
  });

  describe('sendErrorMessage', () => {
    it('should send an error embed message', async () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.sendErrorMessage(mockMessage, 'Error message');

      expect(mockMessage.reply).toHaveBeenCalled();
    });
  });
});
