import { Test, TestingModule } from '@nestjs/testing';
import MemberInfoCommand from './member-info.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { Guild, GuildMember, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServices } from '#command/command.module';
import NicerTimeUtil from '#util/time/nicer-time.util';

describe('MemberInfoCommand', () => {
  let command: MemberInfoCommand;
  let mockGuild: Guild;
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let mockGuildMember: GuildMember;
  let mockUser: User;
  const mockDiscordService = {
    client: {
      user: {
        displayAvatarURL: jest.fn(),
      },
      guilds: {
        fetch: jest.fn().mockResolvedValue({
          members: {
            fetch: jest.fn().mockResolvedValue({
              roles: {
                cache: {
                  size: 2,
                  map: jest.fn().mockReturnValue(['Role1', 'Role2']),
                },
              },
            }),
          },
        }),
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

  const mockCreatedAtValue = new Date('2020-01-01');
  const mockCreatedAtFullValue =
    new Date('2020-01-01').toLocaleString() +
    ` (${NicerTimeUtil.timeSince(new Date('2020-01-01'))} ago)`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: MemberInfoCommand,
          useValue: new MemberInfoCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<MemberInfoCommand>(MemberInfoCommand);

    mockUser = {
      id: '1234567890',
      username: 'TestUser',
      displayAvatarURL: jest
        .fn()
        .mockReturnValue('http://example.com/avatar.png'),
      createdAt: mockCreatedAtValue,
    } as unknown as User;

    mockGuildMember = {
      user: mockUser,
    } as GuildMember;

    mockGuild = {
      id: '1234567890',
    } as unknown as Guild;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should reply with member info embed', async () => {
      const mockMessage = {
        guild: mockGuild,
        mentions: {
          users: {
            first: jest.fn().mockReturnValue(mockUser),
          },
        },
        author: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('runSlash', () => {
    it('should reply with member info embed', async () => {
      const mockInteraction = {
        guild: mockGuild,
        options: {
          get: jest.fn().mockReturnValue({ user: mockUser }),
        },
        user: mockUser,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
      });
    });
  });

  describe('createMemberInfoEmbed', () => {
    it('should create an embed with member info', async () => {
      const embed = await command.createMemberInfoEmbed(mockUser, mockGuild.id);

      expect(embed.data.title).toBe('👤 Member Information');
      expect(embed.data.fields).toEqual([
        { name: 'User Name', value: 'TestUser' },
        { name: 'Roles', value: 'Role1, Role2' },
        {
          inline: true,
          name: 'User ID',
          value: '1234567890',
        },
        {
          inline: true,
          name: 'Created At',
          value: mockCreatedAtFullValue,
        },
      ]);
    });
  });
});
