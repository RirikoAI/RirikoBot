import { Test, TestingModule } from '@nestjs/testing';
import SetupAvcCommand from './setup-avc.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ChannelType, Guild, VoiceChannel } from 'discord.js';
import { DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';

describe('SetAvcCommand', () => {
  let command: SetupAvcCommand;
  let mockGuild: Guild;
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
    db: {
      guildRepository: {} as any,
      voiceChannelRepository: {
        insert: jest.fn(),
      } as any,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SetupAvcCommand,
          useValue: new SetupAvcCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<SetupAvcCommand>(SetupAvcCommand);

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
      channels: {
        create: jest.fn().mockResolvedValue({
          id: '0987654321',
          name: '🔊 Join To Create',
        } as VoiceChannel),
      },
    } as unknown as Guild;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should create a new voice channel and insert it into the database', async () => {
      const mockMessage = {
        guild: mockGuild,
        channel: {
          send: jest.fn(),
        },
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockGuild.channels.create).toHaveBeenCalledWith({
        type: ChannelType.GuildVoice,
        name: '🔊 Join To Create',
      });

      expect(
        mockSharedServices.db.voiceChannelRepository.insert,
      ).toHaveBeenCalledWith({
        id: '0987654321',
        name: '🔊 Join To Create',
        parentId: '0',
        guild: {
          id: mockGuild.id,
        },
      });

      expect(mockMessage.channel.send).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });
});
