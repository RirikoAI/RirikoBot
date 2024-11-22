import { Test, TestingModule } from '@nestjs/testing';
import DeleteCommand from './delete.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, TextChannel } from 'discord.js';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import { SharedServicesMock, TestSharedService } from "../../../test/mocks/shared-services.mock";

describe('DeleteCommand', () => {
  let command: DeleteCommand;
  let mockGuild: Guild;
  let mockTextChannel: TextChannel;
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DeleteCommand,
          useValue: new DeleteCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<DeleteCommand>(DeleteCommand);

    mockTextChannel = {
      bulkDelete: jest.fn(),
      send: jest.fn(),
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
    it('should delete messages if the sender has permission', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        channel: mockTextChannel,
        content: 'delete 5',
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command.setParams('delete 5');

      await command.runPrefix(mockMessage);

      expect(mockTextChannel.bulkDelete).toHaveBeenCalledWith(6);
      expect(mockTextChannel.send).toHaveBeenCalledWith(
        'Deleted 5 messages in this channel.',
      );
    });

    it('should not delete messages if the sender lacks permission', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(false),
          },
        },
        channel: mockTextChannel,
        content: 'delete 5',
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command.setParams('delete 5');

      await command.runPrefix(mockMessage);

      expect(mockTextChannel.bulkDelete).not.toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'You do not have permission to delete messages.',
      );
    });

    it('should not delete messages if the amount is invalid', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        channel: mockTextChannel,
        content: 'delete invalid',
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command.setParams('delete invalid');

      await command.runPrefix(mockMessage);

      expect(mockTextChannel.bulkDelete).not.toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith('Invalid amount.');
    });

    it('should not delete messages if the amount is out of range', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        channel: mockTextChannel,
        content: 'delete 101',
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      command.setParams('delete 101');

      await command.runPrefix(mockMessage);

      expect(mockTextChannel.bulkDelete).not.toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Amount must be between 1 and 100.',
      );
    });
  });

  describe('runSlash', () => {
    it('should delete messages if the sender has permission', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        channel: mockTextChannel,
        options: {
          getInteger: jest.fn().mockReturnValue(5),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockTextChannel.bulkDelete).toHaveBeenCalledWith(6);
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Deleted 5 messages in this channel.',
      );
    });

    it('should not delete messages if the sender lacks permission', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(false),
          },
        },
        channel: mockTextChannel,
        options: {
          getInteger: jest.fn().mockReturnValue(5),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockTextChannel.bulkDelete).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'You do not have permission to delete messages.',
      );
    });

    it('should not delete messages if the amount is out of range', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        channel: mockTextChannel,
        options: {
          getInteger: jest.fn().mockReturnValue(101),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockTextChannel.bulkDelete).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Amount must be between 1 and 100.',
      );
    });
  });
});
