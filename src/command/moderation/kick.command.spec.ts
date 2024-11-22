import { Test, TestingModule } from '@nestjs/testing';
import KickCommand from './kick.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, GuildMember, User } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { SharedServicesMock, TestSharedService } from "../../../test/mocks/shared-services.mock";

describe('KickCommand', () => {
  let command: KickCommand;
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
  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: KickCommand,
          useValue: new KickCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<KickCommand>(KickCommand);

    mockUser = {
      id: '1234567890',
      tag: 'TestUser#1234',
    } as User;

    mockGuildMember = {
      user: mockUser,
      kickable: true,
      permissions: {
        has: jest.fn().mockReturnValue(true),
      },
      kick: jest.fn(),
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
    it('should kick a user if the sender has permission', async () => {
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

      expect(mockGuildMember.kick).toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith(
        `Kicked ${mockUser.tag} from the server.`,
      );
    });

    it('should not kick a user if the sender lacks permission', async () => {
      (mockGuildMember as any).permissions.has = jest.fn().mockReturnValue(false);
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

      expect(mockGuildMember.kick).not.toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'You do not have permission to kick members.',
      );
    });

    it('should not kick a user if no user is mentioned', async () => {
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

      expect(mockGuildMember.kick).not.toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'Please mention a user to kick.',
      );
    });

    it('should not kick a user if the user is not kickable', async () => {
      (mockGuildMember as any).kickable = false;
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

      expect(mockGuildMember.kick).not.toHaveBeenCalled();
      expect(mockMessage.reply).toHaveBeenCalledWith(
        'This user cannot be kicked.',
      );
    });
  });

  describe('runSlash', () => {
    it('should kick a user if the sender has permission', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getMember: jest.fn().mockReturnValue(mockGuildMember),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockGuildMember.kick).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        `Kicked ${mockUser.tag} from the server.`,
      );
    });

    it('should not kick a user if the sender lacks permission', async () => {
      (mockGuildMember as any).permissions.has = jest.fn().mockReturnValue(false);
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getMember: jest.fn().mockReturnValue(mockUser),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockGuildMember.kick).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'You do not have permission to kick members.',
      );
    });

    it('should not kick a user if no user is provided', async () => {
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getMember: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockGuildMember.kick).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'Please mention a user to kick.',
      );
    });

    it('should not kick a user if the user is not kickable', async () => {
      (mockGuildMember as any).kickable = false;
      const mockInteraction = {
        guild: mockGuild,
        member: mockGuildMember,
        options: {
          getMember: jest.fn().mockReturnValue(mockUser),
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockGuildMember.kick).not.toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        'This user cannot be kicked.',
      );
    });
  });
});
