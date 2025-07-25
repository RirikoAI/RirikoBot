import { Test, TestingModule } from '@nestjs/testing';
import ReactionRolesCommand from './reaction-roles.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, Role } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';

describe('ReactionRolesCommand', () => {
  let command: ReactionRolesCommand;
  let mockGuild: Guild;
  let mockRole: Role;

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

  const mockReactionRoleService = {
    getReactionRoles: jest.fn(),
    deleteReactionRole: jest.fn(),
  };

  const mockSharedServices: SharedServicesMock = {
    ...TestSharedService,
    discord: mockDiscordService as unknown as DiscordService,
    commandService: mockCommandService as unknown as CommandService,
    reactionRoleService: mockReactionRoleService,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ReactionRolesCommand,
          useValue: new ReactionRolesCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<ReactionRolesCommand>(ReactionRolesCommand);

    mockRole = {
      id: '123456789',
      name: 'TestRole',
    } as unknown as Role;

    mockGuild = {
      id: '123',
      roles: {
        cache: {
          get: jest.fn().mockReturnValue(mockRole),
        },
      },
    } as unknown as Guild;

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('runPrefix', () => {
    it('should handle missing administrator permission', async () => {
      const mockMessage = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(false),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'You need Administrator permission to use this command.',
      });
    });

    it('should handle remove subcommand', async () => {
      const mockMessage = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        content: 'reaction-roles remove 123456789',
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockReactionRoleService.deleteReactionRole.mockResolvedValueOnce(
        undefined,
      );

      await command.runPrefix(mockMessage);

      expect(mockReactionRoleService.deleteReactionRole).toHaveBeenCalledWith(
        '123456789',
      );
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Successfully removed reaction role with ID: 123456789',
        ephemeral: true,
      });
    });

    it('should list reaction roles when no subcommand is provided', async () => {
      const mockMessage = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        content: 'reaction-roles',
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockReactionRoleService.getReactionRoles.mockResolvedValueOnce([
        { id: '1', messageId: '123', emoji: '👍', roleId: '123456789' },
      ]);

      await command.runPrefix(mockMessage);

      expect(mockReactionRoleService.getReactionRoles).toHaveBeenCalledWith(
        mockGuild.id,
      );
      expect(mockMessage.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
        ephemeral: true,
      });
    });
  });

  describe('runSlash', () => {
    it('should handle missing administrator permission', async () => {
      const mockInteraction = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(false),
          },
        },
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'You need Administrator permission to use this command.',
        ephemeral: true,
      });
    });

    it('should handle remove subcommand', async () => {
      const mockInteraction = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        options: {
          getSubcommand: jest.fn().mockReturnValue('remove'),
          getString: jest.fn().mockReturnValue('123456789'),
        },
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockReactionRoleService.deleteReactionRole.mockResolvedValueOnce(
        undefined,
      );

      await command.runSlash(mockInteraction);

      expect(mockReactionRoleService.deleteReactionRole).toHaveBeenCalledWith(
        '123456789',
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Successfully removed reaction role with ID: 123456789',
        ephemeral: true,
      });
    });

    it('should list reaction roles for list subcommand', async () => {
      const mockInteraction = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        options: {
          getSubcommand: jest.fn().mockReturnValue('list'),
        },
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      mockReactionRoleService.getReactionRoles.mockResolvedValueOnce([
        { id: '1', messageId: '123', emoji: '👍', roleId: '123456789' },
      ]);

      await command.runSlash(mockInteraction);

      expect(mockReactionRoleService.getReactionRoles).toHaveBeenCalledWith(
        mockGuild.id,
      );
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        embeds: [expect.any(Object)],
        ephemeral: true,
      });
    });
  });

  describe('handleListReactionRoles', () => {
    it('should handle no reaction roles', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockReactionRoleService.getReactionRoles.mockResolvedValueOnce([]);

      await command['handleListReactionRoles'](mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'No reaction roles have been set up in this server.',
        ephemeral: true,
      });
    });

    it('should handle error when listing reaction roles', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockReactionRoleService.getReactionRoles.mockRejectedValueOnce(
        new Error('Test error'),
      );

      await command['handleListReactionRoles'](mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'An error occurred: Test error',
        ephemeral: true,
      });
    });
  });

  describe('handleRemoveReactionRole', () => {
    it('should handle error when removing reaction role', async () => {
      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      mockReactionRoleService.deleteReactionRole.mockRejectedValueOnce(
        new Error('Test error'),
      );

      await command['handleRemoveReactionRole'](mockMessage, '123456789');

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Error removing reaction role: Test error',
        ephemeral: true,
      });
    });
  });
});
