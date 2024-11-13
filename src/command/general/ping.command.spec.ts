import { Test, TestingModule } from '@nestjs/testing';
import PingCommand from './ping.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { Guild, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServices } from '#command/command.module';

describe('PingCommand', () => {
  let command: PingCommand;
  let mockGuild: Guild;
  let mockUser: User;
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
          provide: PingCommand,
          useValue: new PingCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<PingCommand>(PingCommand);

    mockUser = {
      id: '1234567890',
      username: 'TestUser',
      displayAvatarURL: jest.fn().mockReturnValue('http://avatar.url'),
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
    it('should reply with the ping delay', async () => {
      const mockMessage = {
        guild: mockGuild,
        author: mockUser,
        createdTimestamp: Date.now(),
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('runSlash', () => {
    it('should reply with the ping delay', async () => {
      const mockInteraction = {
        guild: mockGuild,
        user: mockUser,
        createdTimestamp: Date.now(),
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });
});
