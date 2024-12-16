import { Test, TestingModule } from '@nestjs/testing';
import UnlockCommand from './unlock.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, TextChannel } from 'discord.js';
import { DiscordMessage, DiscordInteraction } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';

describe('UnlockCommand', () => {
  let command: UnlockCommand;
  let mockGuild: Guild;
  let mockTextChannel: TextChannel;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
      channels: {
        fetch: jest.fn(),
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
          provide: UnlockCommand,
          useValue: new UnlockCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<UnlockCommand>(UnlockCommand);

    mockTextChannel = {
      id: '1234567890',
      guild: {
        roles: {
          everyone: {
            id: 'everyone',
          },
        },
      },
      permissionOverwrites: {
        edit: jest.fn(),
      },
    } as unknown as TextChannel;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;

    mockDiscordService.client.channels.fetch.mockResolvedValue(mockTextChannel);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should unlock the channel and send a reply', async () => {
      const mockMessage = {
        guild: mockGuild,
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockTextChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        mockTextChannel.guild.roles.everyone,
        { SendMessages: true },
      );
      expect(mockMessage.reply).toHaveBeenCalled();
    });
  });

  describe('runSlash', () => {
    it('should unlock the channel and send a reply', async () => {
      const mockInteraction = {
        guild: mockGuild,
        channel: mockTextChannel,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockTextChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        mockTextChannel.guild.roles.everyone,
        { SendMessages: true },
      );
      expect(mockInteraction.reply).toHaveBeenCalled();
    });
  });

  describe('unlockChannel', () => {
    it('should unlock the channel', async () => {
      await command.unlockChannel(mockTextChannel.id);

      expect(mockTextChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        mockTextChannel.guild.roles.everyone,
        { SendMessages: true },
      );
    });
  });
});
