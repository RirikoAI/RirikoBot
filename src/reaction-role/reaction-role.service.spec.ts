import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReactionRoleService } from './reaction-role.service';
import { ReactionRole } from '#database/entities/reaction-role.entity';
import { Guild as DiscordGuild, GuildMember, Role } from 'discord.js';

describe('ReactionRoleService', () => {
  let service: ReactionRoleService;
  let repository: jest.Mocked<Repository<ReactionRole>>;

  beforeEach(async () => {
    // Create mock repository
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReactionRoleService,
        {
          provide: getRepositoryToken(ReactionRole),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ReactionRoleService>(ReactionRoleService);
    repository = module.get(getRepositoryToken(ReactionRole));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createReactionRole', () => {
    it('should create and save a new reaction role', async () => {
      // Arrange
      const guildId = 'guild-id';
      const messageId = 'message-id';
      const emoji = '👍';
      const roleId = 'role-id';

      const mockReactionRole = {
        id: '1',
        messageId,
        emoji,
        roleId,
        guild: { id: guildId },
      } as any;
      repository.create.mockReturnValue(mockReactionRole);
      repository.save.mockResolvedValue(mockReactionRole);

      // Act
      const result = await service.createReactionRole(
        guildId,
        messageId,
        emoji,
        roleId,
      );

      // Assert
      expect(repository.create).toHaveBeenCalledWith({
        messageId,
        emoji,
        roleId,
        guild: { id: guildId },
      });
      expect(repository.save).toHaveBeenCalledWith(mockReactionRole);
      expect(result).toEqual(mockReactionRole);
    });
  });

  describe('getReactionRoles', () => {
    it('should return all reaction roles for a guild', async () => {
      // Arrange
      const guildId = 'guild-id';
      const mockReactionRoles = [
        {
          id: '1',
          messageId: 'message-1',
          emoji: '👍',
          roleId: 'role-1',
          guild: { id: guildId },
        },
        {
          id: '2',
          messageId: 'message-2',
          emoji: '👎',
          roleId: 'role-2',
          guild: { id: guildId },
        },
      ] as any;
      repository.find.mockResolvedValue(mockReactionRoles);

      // Act
      const result = await service.getReactionRoles(guildId);

      // Assert
      expect(repository.find).toHaveBeenCalledWith({
        where: { guild: { id: guildId } },
      });
      expect(result).toEqual(mockReactionRoles);
    });
  });

  describe('getReactionRole', () => {
    it('should return a reaction role by message ID and emoji', async () => {
      // Arrange
      const messageId = 'message-id';
      const emoji = '👍';
      const mockReactionRole = {
        id: '1',
        messageId,
        emoji,
        roleId: 'role-id',
        guild: { id: 'guild-id' },
      } as any;
      repository.findOne.mockResolvedValue(mockReactionRole);

      // Act
      const result = await service.getReactionRole(messageId, emoji);

      // Assert
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { messageId, emoji },
        relations: ['guild'],
      });
      expect(result).toEqual(mockReactionRole);
    });

    it('should return null if no reaction role is found', async () => {
      // Arrange
      const messageId = 'message-id';
      const emoji = '👍';
      repository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.getReactionRole(messageId, emoji);

      // Assert
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { messageId, emoji },
        relations: ['guild'],
      });
      expect(result).toBeNull();
    });
  });

  describe('deleteReactionRole', () => {
    it('should delete a reaction role by ID', async () => {
      // Arrange
      const id = 'reaction-role-id';
      const mockReactionRole = {
        id,
        messageId: 'message-id',
        emoji: '👍',
        roleId: 'role-id',
        guild: { id: 'guild-id' },
      } as any;
      repository.findOne.mockResolvedValue(mockReactionRole);
      repository.remove.mockResolvedValue(mockReactionRole);

      // Act
      const result = await service.deleteReactionRole(id);

      // Assert
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id },
      });
      expect(repository.remove).toHaveBeenCalledWith(mockReactionRole);
      expect(result).toEqual(mockReactionRole);
    });

    it('should throw an error if the reaction role is not found', async () => {
      // Arrange
      const id = 'non-existent-id';
      repository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deleteReactionRole(id)).rejects.toThrow(
        'Reaction role not found',
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id },
      });
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

  describe('hasPermission', () => {
    it('should return true if the bot has ManageRoles permission', () => {
      // Arrange
      const mockGuild = {
        members: {
          cache: {
            get: jest.fn(),
          },
        },
        client: {
          user: {
            id: 'bot-id',
          },
        },
      } as unknown as any;

      const mockBotMember = {
        permissions: {
          has: jest.fn().mockReturnValue(true),
        },
      };

      mockGuild.members.cache.get.mockReturnValue(mockBotMember);

      // Act
      const result = service.hasPermission(mockGuild);

      // Assert
      expect(mockGuild.members.cache.get).toHaveBeenCalledWith('bot-id');
      expect(mockBotMember.permissions.has).toHaveBeenCalledWith('ManageRoles');
      expect(result).toBe(true);
    });

    it('should return false if the bot does not have ManageRoles permission', () => {
      // Arrange
      const mockGuild = {
        members: {
          cache: {
            get: jest.fn(),
          },
        },
        client: {
          user: {
            id: 'bot-id',
          },
        },
      } as unknown as any;

      const mockBotMember = {
        permissions: {
          has: jest.fn().mockReturnValue(false),
        },
      };

      mockGuild.members.cache.get.mockReturnValue(mockBotMember);

      // Act
      const result = service.hasPermission(mockGuild);

      // Assert
      expect(mockGuild.members.cache.get).toHaveBeenCalledWith('bot-id');
      expect(mockBotMember.permissions.has).toHaveBeenCalledWith('ManageRoles');
      expect(result).toBe(false);
    });

    it('should return false if the bot member is not found', () => {
      // Arrange
      const mockGuild = {
        members: {
          cache: {
            get: jest.fn().mockReturnValue(null),
          },
        },
        client: {
          user: {
            id: 'bot-id',
          },
        },
      } as unknown as DiscordGuild;

      // Act
      const result = service.hasPermission(mockGuild);

      // Assert
      expect(mockGuild.members.cache.get).toHaveBeenCalledWith('bot-id');
      expect(result).toBe(false);
    });
  });

  describe('isValidRole', () => {
    it('should return false if the role is not found', () => {
      // Arrange
      const mockGuild = {
        roles: {
          cache: {
            get: jest.fn().mockReturnValue(null),
          },
        },
      } as unknown as DiscordGuild;

      // Act
      const result = service.isValidRole(mockGuild, 'non-existent-role-id');

      // Assert
      expect(mockGuild.roles.cache.get).toHaveBeenCalledWith(
        'non-existent-role-id',
      );
      expect(result).toBe(false);
    });

    it('should return false if the role is the @everyone role', () => {
      // Arrange
      const guildId = 'guild-id';
      const mockGuild = {
        id: guildId,
        roles: {
          cache: {
            get: jest.fn(),
          },
        },
      } as unknown as any;

      const mockRole = {
        id: guildId, // Same as guild ID, which makes it the @everyone role
      };

      mockGuild.roles.cache.get.mockReturnValue(mockRole);

      // Act
      const result = service.isValidRole(mockGuild, guildId);

      // Assert
      expect(mockGuild.roles.cache.get).toHaveBeenCalledWith(guildId);
      expect(result).toBe(false);
    });

    it('should return false if the bot member is not found', () => {
      // Arrange
      const roleId = 'role-id';
      const mockGuild = {
        id: 'guild-id',
        roles: {
          cache: {
            get: jest.fn(),
          },
        },
        members: {
          cache: {
            get: jest.fn().mockReturnValue(null),
          },
        },
        client: {
          user: {
            id: 'bot-id',
          },
        },
      } as unknown as any;

      const mockRole = {
        id: roleId,
      };

      mockGuild.roles.cache.get.mockReturnValue(mockRole);

      // Act
      const result = service.isValidRole(mockGuild, roleId);

      // Assert
      expect(mockGuild.roles.cache.get).toHaveBeenCalledWith(roleId);
      expect(mockGuild.members.cache.get).toHaveBeenCalledWith('bot-id');
      expect(result).toBe(false);
    });

    it("should return true if the bot's highest role is higher than the role to assign", () => {
      // Arrange
      const roleId = 'role-id';
      const mockGuild = {
        id: 'guild-id',
        roles: {
          cache: {
            get: jest.fn(),
          },
        },
        members: {
          cache: {
            get: jest.fn(),
          },
        },
        client: {
          user: {
            id: 'bot-id',
          },
        },
      } as unknown as any;

      const mockRole = {
        id: roleId,
        position: 5,
      };

      const mockBotMember = {
        roles: {
          highest: {
            position: 10, // Higher position than the role
          },
        },
      };

      mockGuild.roles.cache.get.mockReturnValue(mockRole);
      mockGuild.members.cache.get.mockReturnValue(mockBotMember);

      // Act
      const result = service.isValidRole(mockGuild, roleId);

      // Assert
      expect(mockGuild.roles.cache.get).toHaveBeenCalledWith(roleId);
      expect(mockGuild.members.cache.get).toHaveBeenCalledWith('bot-id');
      expect(result).toBe(true);
    });

    it("should return false if the bot's highest role is not higher than the role to assign", () => {
      // Arrange
      const roleId = 'role-id';
      const mockGuild = {
        id: 'guild-id',
        roles: {
          cache: {
            get: jest.fn(),
          },
        },
        members: {
          cache: {
            get: jest.fn(),
          },
        },
        client: {
          user: {
            id: 'bot-id',
          },
        },
      } as unknown as any;

      const mockRole = {
        id: roleId,
        position: 10,
      };

      const mockBotMember = {
        roles: {
          highest: {
            position: 5, // Lower position than the role
          },
        },
      };

      mockGuild.roles.cache.get.mockReturnValue(mockRole);
      mockGuild.members.cache.get.mockReturnValue(mockBotMember);

      // Act
      const result = service.isValidRole(mockGuild, roleId);

      // Assert
      expect(mockGuild.roles.cache.get).toHaveBeenCalledWith(roleId);
      expect(mockGuild.members.cache.get).toHaveBeenCalledWith('bot-id');
      expect(result).toBe(false);
    });
  });

  describe('assignRole', () => {
    it('should assign a role to a member successfully', async () => {
      // Arrange
      const mockMember = {
        roles: {
          add: jest.fn().mockResolvedValue(undefined),
        },
      } as unknown as GuildMember;

      const mockRole = {} as Role;

      // Act
      const result = await service.assignRole(mockMember, mockRole);

      // Assert
      expect(mockMember.roles.add).toHaveBeenCalledWith(mockRole);
      expect(result).toBe(true);
    });

    it('should return false if there is an error assigning the role', async () => {
      // Arrange
      const mockMember = {
        roles: {
          add: jest.fn().mockRejectedValue(new Error('Failed to add role')),
        },
      } as unknown as GuildMember;

      const mockRole = {} as Role;

      // Mock console.error to prevent actual logging during tests
      jest.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const result = await service.assignRole(mockMember, mockRole);

      // Assert
      expect(mockMember.roles.add).toHaveBeenCalledWith(mockRole);
      expect(console.error).toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('removeRole', () => {
    it('should remove a role from a member successfully', async () => {
      // Arrange
      const mockMember = {
        roles: {
          remove: jest.fn().mockResolvedValue(undefined),
        },
      } as unknown as GuildMember;

      const mockRole = {} as Role;

      // Act
      const result = await service.removeRole(mockMember, mockRole);

      // Assert
      expect(mockMember.roles.remove).toHaveBeenCalledWith(mockRole);
      expect(result).toBe(true);
    });

    it('should return false if there is an error removing the role', async () => {
      // Arrange
      const mockMember = {
        roles: {
          remove: jest
            .fn()
            .mockRejectedValue(new Error('Failed to remove role')),
        },
      } as unknown as GuildMember;

      const mockRole = {} as Role;

      // Mock console.error to prevent actual logging during tests
      jest.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const result = await service.removeRole(mockMember, mockRole);

      // Assert
      expect(mockMember.roles.remove).toHaveBeenCalledWith(mockRole);
      expect(console.error).toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
