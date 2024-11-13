// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import BanCommand from './ban.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { Guild, GuildMember, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServices } from '#command/command.module';

describe('BanCommand', () => {
  let command: BanCommand;
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
          provide: BanCommand,
          useValue: new BanCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<BanCommand>(BanCommand);

    mockUser = {
      id: '1234567890',
      tag: 'TestUser#1234',
    } as User;

    mockGuildMember = {
      user: mockUser,
      bannable: true,
      permissions: {
        has: jest.fn().mockReturnValue(true),
      },
      ban: jest.fn(),
      ...mockUser,
    } as unknown as GuildMember;

    mockGuild = {
      id: '1234567890',
      name: 'Test Guild',
    } as unknown as Guild;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should ban a user if the sender has permission', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        mentions: {
          members: {
            first: jest.fn().mockReturnValue(mockGuildMember),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockGuildMember.ban).toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith(
        `Banned ${mockUser.tag} from the server.`,
      );
    });

    it('should not ban a user if the sender lacks permission', async () => {
      mockGuildMember.permissions.has = jest.fn().mockReturnValue(false);
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        mentions: {
          members: {
            first: jest.fn().mockReturnValue(mockGuildMember),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockGuildMember.ban).not.toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'You do not have permission to ban members.',
      );
    });

    it('should not ban a user if no user is mentioned', async () => {
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        mentions: {
          members: {
            first: jest.fn().mockReturnValue(null),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockGuildMember.ban).not.toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Please mention a user to ban.',
      );
    });

    it('should not ban a user if the user is not bannable', async () => {
      mockGuildMember.bannable = false;
      const mockMessage = {
        guild: mockGuild,
        member: mockGuildMember,
        mentions: {
          members: {
            first: jest.fn().mockReturnValue(mockGuildMember),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockGuildMember.ban).not.toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'This user cannot be banned.',
      );
    });
  });

  describe('runSlash', () => {
    it('should ban a user if the sender has permission', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getUser: jest.fn().mockReturnValue(mockGuildMember),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;
      await command.runSlash(mockInteraction);

      expect(mockGuildMember.ban).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        `Banned ${mockUser.tag} from the server.`,
      );
    });

    it('should not ban a user if the sender lacks permission', async () => {
      mockGuildMember.permissions.has = jest.fn().mockReturnValue(false);
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getUser: jest.fn().mockReturnValue(mockUser),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockGuildMember.ban).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'You do not have permission to ban members.',
      );
    });

    it('should not ban a user if no user is provided', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getUser: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockGuildMember.ban).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Please mention a user to ban.',
      );
    });

    it('should not ban a user if the user is not bannable', async () => {
      mockGuildMember.bannable = false;
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getUser: jest.fn().mockReturnValue(mockUser),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockGuildMember.ban).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'This user cannot be banned.',
      );
    });
  });
});
