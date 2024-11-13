import { Test, TestingModule } from '@nestjs/testing';
import GuildInfoCommand from './guild-info.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { Guild, GuildMember, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServices } from '#command/command.module';

describe('GuildInfoCommand', () => {
  let command: GuildInfoCommand;
  let mockGuild: Guild;
  let mockGuildMember: GuildMember;
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
          provide: GuildInfoCommand,
          useValue: new GuildInfoCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<GuildInfoCommand>(GuildInfoCommand);

    mockUser = {
      tag: 'Owner#1234',
    } as User;

    mockGuildMember = {
      user: mockUser,
    } as GuildMember;

    mockGuild = {
      name: 'Test Guild',
      memberCount: 100,
      id: '1234567890',
      createdAt: new Date('2020-01-01'),
      iconURL: jest.fn().mockReturnValue('http://example.com/icon.png'),
      fetchOwner: jest.fn().mockResolvedValue(mockGuildMember),
    } as unknown as Guild;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with guild info embed', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('runSlash', () => {
    it('should reply with guild info embed', async () => {
      const mockInteraction = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('createGuildInfoEmbed', () => {
    it('should create an embed with guild info', async () => {
      const embed = await command['createGuildInfoEmbed'](mockGuild);
      expect(embed.data.title).toBe('🏡 Guild Information');
      expect(embed.data.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Guild Name', value: 'Test Guild' }),
          expect.objectContaining({ name: 'Members', value: '100' }),
          expect.objectContaining({ name: 'Guild Owner', value: 'Owner#1234' }),
          expect.objectContaining({ name: 'Guild ID', value: '1234567890' }),
          expect.objectContaining({
            name: 'Created At',
            value: 'Wed Jan 01 2020',
          }),
        ]),
      );
    });
  });
});
