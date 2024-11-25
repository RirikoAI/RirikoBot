import { Test, TestingModule } from '@nestjs/testing';
import EndCommand from './end.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, GuildMember, TextChannel } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';

describe('EndCommand', () => {
  let command: EndCommand;
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
        end: jest.fn().mockResolvedValue(undefined), // Ensure end returns a resolved promise
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
          provide: EndCommand,
          useValue: new EndCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<EndCommand>(EndCommand);

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
    it('should end a giveaway with valid message ID', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway end 1234567890',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      jest.spyOn(command, 'endGiveaway').mockImplementation(async () => {});

      await command.runPrefix(mockMessage);

      expect(command.endGiveaway).toBeCalled();
    });
  });

  describe('runSlash', () => {
    it('should end a giveaway with valid message ID', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getString: jest.fn().mockReturnValue('1234567890'),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      jest.spyOn(command, 'endGiveaway').mockImplementation(async () => {});

      await command.runSlash(mockInteraction);

      expect(command.endGiveaway).toHaveBeenCalledWith(
        mockInteraction,
        '1234567890',
      );
    });
  });

  describe('endGiveaway', () => {
    it('should send error message if no giveaway found', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway end 1234567890',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      jest
        .spyOn(command, 'sendErrorMessage')
        .mockImplementation(async () => {});

      await command.endGiveaway(mockMessage, '1234567890');

      expect(command.sendErrorMessage).toHaveBeenCalledWith(
        mockMessage,
        'No giveaway found for the message ID: 1234567890',
      );
    });

    it('should end the giveaway if found', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway end 1234567890',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const mockGiveaway = { messageId: '1234567890' };
      mockDiscordService.client.giveawaysManager.giveaways.push(mockGiveaway);

      await command.endGiveaway(mockMessage, '1234567890');

      expect(
        mockDiscordService.client.giveawaysManager.end,
      ).toHaveBeenCalledWith('1234567890');
      expect(mockMessage.reply).toHaveBeenCalledWith('Giveaway ended!');
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
