import { Test, TestingModule } from '@nestjs/testing';
import GetAvatarCommand from './get-avatar.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { Guild, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServices } from '#command/command.module';

describe('GetAvatarCommand', () => {
  let command: GetAvatarCommand;
  let mockGuild: Guild;
  let mockUser: User;
  let mockMentionedUser: User;

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
  const mockSharedServices: SharedServices = {
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
          provide: GetAvatarCommand,
          useValue: new GetAvatarCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<GetAvatarCommand>(GetAvatarCommand);

    mockUser = {
      id: '1234567890',
      username: 'TestUser',
      displayAvatarURL: jest.fn().mockReturnValue('http://avatar.url'),
    } as unknown as User;

    mockMentionedUser = {
      id: '1234567890',
      username: 'TestUser',
      displayAvatarURL: jest.fn().mockReturnValue('http://other.avatar.url'),
    } as unknown as User;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with the avatar of the mentioned user', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        mentions: {
          users: {
            first: jest.fn().mockReturnValue(mockMentionedUser),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should reply with the avatar of the author if no user is mentioned', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        mentions: {
          users: {
            first: jest.fn().mockReturnValue(null),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('runSlash', () => {
    it('should reply with the avatar of the provided user', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        options: {
          getUser: jest.fn().mockReturnValue(mockMentionedUser),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });

    it('should reply with the avatar of the interaction user if no user is provided', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        options: {
          getUser: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });
});
