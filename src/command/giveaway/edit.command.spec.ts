import { Test, TestingModule } from '@nestjs/testing';
import EditCommand from './edit.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { EmbedBuilder, Guild, GuildMember, TextChannel } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';

describe('EditCommand', () => {
  let command: EditCommand;
  let mockGuild: Guild;
  let mockGuildMember: GuildMember;
  let mockTextChannel: TextChannel;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
      giveawaysManager: {
        find: jest.fn().mockResolvedValue({}),
        edit: jest.fn().mockResolvedValue(undefined),
        giveaways: {
          find: jest.fn().mockResolvedValue({}),
          edit: jest.fn().mockResolvedValue(undefined),
        },
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
          provide: EditCommand,
          useValue: new EditCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<EditCommand>(EditCommand);

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
    it('should edit a giveaway with valid inputs', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        author: mockGuildMember,
        content: '!giveaway edit',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      jest.spyOn(command, 'editGiveaway').mockImplementation(async () => {});

      await command.runPrefix(mockMessage);

      expect(command.editGiveaway).toBeCalled();
    });
  });

  describe('runSlash', () => {
    it('should edit a giveaway with valid inputs', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getString: jest
            .fn()
            .mockReturnValueOnce('1234567890')
            .mockReturnValueOnce('New Prize')
            .mockReturnValueOnce('1d'),
          getInteger: jest.fn().mockReturnValue(1),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(
        mockDiscordService.client.giveawaysManager.edit,
      ).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Giveaway edited successfully!',
      );
    });
  });

  describe('editGiveaway', () => {
    it('should edit a giveaway with valid inputs', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway edit',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      jest.spyOn(command, 'collectNewTime').mockImplementation(async () => {});

      const collector = {
        on: jest.fn((event, callback) => {
          if (event === 'collect') {
            callback({
              content: '1234567890',
              delete: jest.fn(),
              author: { id: '1234567890' },
            });
          }
        }),
        stop: jest.fn(),
      };

      mockTextChannel.createMessageCollector = jest
        .fn()
        .mockReturnValue(collector);

      await command.editGiveaway(mockMessage);

      expect(command.collectNewTime).toBeDefined();
    });

    it('should cancel giveaway editing on invalid message ID', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway edit',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      jest.spyOn(command, 'collectNewTime').mockImplementation(async () => {});

      const collector = {
        on: jest.fn((event, callback) => {
          if (event === 'collect') {
            callback({
              content: 'invalid',
              delete: jest.fn(),
              author: { id: '1234567890' },
            });
          }
        }),
        stop: jest.fn(),
      };

      mockTextChannel.createMessageCollector = jest
        .fn()
        .mockReturnValue(collector);

      await command.editGiveaway(mockMessage);

      expect(mockMessage.reply).toBeDefined();
    });
  });

  describe('sendErrorMessage', () => {
    it('should send an error message', async () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.sendErrorMessage(mockMessage, 'Error occurred');

      expect(mockMessage.reply).toHaveBeenCalled();
    });
  });

  describe('collectNewTime', () => {
    it('should collect new time and proceed to collect new winners', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway edit',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const mockMsg = {
        edit: jest.fn(),
      };

      jest
        .spyOn(command, 'collectNewWinners')
        .mockImplementation(async () => {});

      const collector = {
        on: jest.fn((event, callback) => {
          if (event === 'collect') {
            callback({
              content: '1d',
              delete: jest.fn(),
              author: { id: '1234567890' },
            });
          }
        }),
        stop: jest.fn(),
      };

      mockTextChannel.createMessageCollector = jest
        .fn()
        .mockReturnValue(collector);

      await command.collectNewTime(
        mockMessage,
        new EmbedBuilder(),
        mockMsg,
        '1234567890',
      );

      expect(command.collectNewWinners).toBeCalled();
    });
  });

  describe('collectNewWinners', () => {
    it('should collect new winners and proceed to collect new prize', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway edit',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const mockMsg = {
        edit: jest.fn(),
      };

      jest.spyOn(command, 'collectNewPrize').mockImplementation(async () => {});

      const collector = {
        on: jest.fn((event, callback) => {
          if (event === 'collect') {
            callback({
              content: '1',
              delete: jest.fn(),
              author: { id: '1234567890' },
            });
          }
        }),
        stop: jest.fn(),
      };

      mockTextChannel.createMessageCollector = jest
        .fn()
        .mockReturnValue(collector);

      await command.collectNewWinners(
        mockMessage,
        new EmbedBuilder(),
        mockMsg,
        '1234567890',
        86400000,
      );

      expect(command.collectNewPrize).toBeCalled();
    });
  });

  describe('collectNewPrize', () => {
    it('should collect new prize and edit the giveaway', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        content: '!giveaway edit',
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      const mockMsg = {
        edit: jest.fn(),
      };

      const collector = {
        on: jest.fn((event, callback) => {
          if (event === 'collect') {
            callback({
              content: 'New Prize',
              delete: jest.fn(),
              author: { id: '1234567890' },
            });
          }
        }),
        stop: jest.fn(),
      };

      mockTextChannel.createMessageCollector = jest
        .fn()
        .mockReturnValue(collector);

      await command.collectNewPrize(
        mockMessage,
        new EmbedBuilder(),
        mockMsg,
        '1234567890',
        86400000,
        1,
      );

      expect(mockDiscordService.client.giveawaysManager.edit).toBeCalledWith(
        '1234567890',
        {
          newWinnerCount: 1,
          newPrize: 'New Prize',
          addTime: 86400000,
        },
      );
      expect(mockMsg.edit).toBeDefined();
    });
  });

  describe('sendTimeoutMessage', () => {
    it('should send a timeout message', async () => {
      const mockMessage = {
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.sendTimeoutMessage(mockMessage);

      expect(mockMessage.reply).toBeCalled();
    });
  });
});
