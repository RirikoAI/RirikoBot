import { Test, TestingModule } from '@nestjs/testing';
import CreateReactionRoleCommand from './create-reaction-role.command';
import { CommandService } from '#command/command.service';
import { DiscordService } from '#discord/discord.service';
import { Guild, Message, Role, TextChannel } from 'discord.js';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import {
  SharedServicesMock,
  TestSharedService,
} from '../../../test/mocks/shared-services.mock';

describe('CreateReactionRoleCommand', () => {
  let command: CreateReactionRoleCommand;
  let mockGuild: Guild;
  let mockRole: Role;
  let mockChannel: TextChannel;
  let mockTargetMessage: Message;

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
    hasPermission: jest.fn(),
    isValidRole: jest.fn(),
    createReactionRole: jest.fn(),
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
          provide: CreateReactionRoleCommand,
          useValue: new CreateReactionRoleCommand(mockSharedServices),
        },
      ],
    }).compile();

    command = module.get<CreateReactionRoleCommand>(CreateReactionRoleCommand);

    mockRole = {
      id: '123456789',
      name: 'TestRole',
    } as unknown as Role;

    mockTargetMessage = {
      url: 'https://discord.com/channels/123/456/789',
      react: jest.fn(),
    } as unknown as Message;

    mockChannel = {
      id: '456',
      isTextBased: jest.fn().mockReturnValue(true),
      messages: {
        fetch: jest.fn().mockResolvedValue(mockTargetMessage),
      },
    } as unknown as TextChannel;

    mockGuild = {
      id: '123',
      channels: {
        fetch: jest.fn().mockResolvedValue(mockChannel),
      },
      roles: {
        cache: {
          get: jest.fn().mockReturnValue(mockRole),
        },
      },
    } as unknown as Guild;

    // Reset all mocks
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

    it('should handle missing arguments', async () => {
      const mockMessage = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        content: 'create-reaction-role',
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Please provide a message ID, emoji, and role.',
      });
    });

    it('should successfully create reaction role', async () => {
      mockReactionRoleService.hasPermission.mockReturnValue(true);
      mockReactionRoleService.isValidRole.mockReturnValue(true);

      const mockMessage = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        content: 'create-reaction-role 123456789 👍 @TestRole',
        guild: mockGuild,
        channelId: '456',
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command.runPrefix(mockMessage);

      expect(mockReactionRoleService.createReactionRole).toHaveBeenCalledWith(
        mockGuild.id,
        '123456789',
        '👍',
        expect.any(String),
      );
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

    it('should successfully create reaction role', async () => {
      mockReactionRoleService.hasPermission.mockReturnValue(true);
      mockReactionRoleService.isValidRole.mockReturnValue(true);

      const mockInteraction = {
        member: {
          permissions: {
            has: jest.fn().mockReturnValue(true),
          },
        },
        options: {
          getString: jest.fn().mockImplementation((option) => {
            const values = {
              'message-id': '123456789',
              emoji: '👍',
            };
            return values[option];
          }),
          getRole: jest.fn().mockReturnValue(mockRole),
        },
        guild: mockGuild,
        channelId: '456',
        reply: jest.fn(),
      } as unknown as DiscordInteraction;

      await command.runSlash(mockInteraction);

      expect(mockReactionRoleService.createReactionRole).toHaveBeenCalledWith(
        mockGuild.id,
        '123456789',
        '👍',
        mockRole.id,
      );
    });
  });

  describe('handleReactionRole', () => {
    it('should handle missing bot permissions', async () => {
      mockReactionRoleService.hasPermission.mockReturnValue(false);

      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command['handleReactionRole'](
        mockMessage,
        '123456789',
        '👍',
        '123456789',
      );

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: "I don't have permission to manage roles in this server.",
        ephemeral: true,
      });
    });

    it('should handle invalid role', async () => {
      mockReactionRoleService.hasPermission.mockReturnValue(true);
      mockReactionRoleService.isValidRole.mockReturnValue(false);

      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command['handleReactionRole'](
        mockMessage,
        '123456789',
        '👍',
        '123456789',
      );

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content:
          'Invalid role. Make sure the role exists and is not the @everyone role. Also, my highest role must be above the role you want to assign.',
        ephemeral: true,
      });
    });

    it('should handle message not found', async () => {
      mockReactionRoleService.hasPermission.mockReturnValue(true);
      mockReactionRoleService.isValidRole.mockReturnValue(true);
      (mockChannel as any).messages.fetch.mockRejectedValueOnce(
        new Error('Message not found'),
      );

      const mockMessage = {
        guild: mockGuild,
        reply: jest.fn(),
      } as unknown as DiscordMessage;

      await command['handleReactionRole'](
        mockMessage,
        '123456789',
        '👍',
        '123456789',
      );

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: 'Error: Message not found.',
        ephemeral: true,
      });
    });
  });
});
