import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { AutoRoleService } from '../autorole.service.js';
import type { AutoRoleRepository } from '@ririko/database';

describe('AutoRoleService (TASK-1402)', () => {
  let autoRoleRepo: {
    getGuildAutoRoles: ReturnType<typeof vi.fn>;
    upsertGuildAutoRoles: ReturnType<typeof vi.fn>;
    addTemporaryRole: ReturnType<typeof vi.fn>;
    findExpiredTemporaryRoles: ReturnType<typeof vi.fn>;
    removeTemporaryRole: ReturnType<typeof vi.fn>;
    findTemporaryRole: ReturnType<typeof vi.fn>;
  };
  let service: AutoRoleService;

  beforeEach(() => {
    autoRoleRepo = {
      getGuildAutoRoles: vi.fn(),
      upsertGuildAutoRoles: vi.fn(),
      addTemporaryRole: vi.fn(),
      findExpiredTemporaryRoles: vi.fn(),
      removeTemporaryRole: vi.fn(),
      findTemporaryRole: vi.fn(),
    };
    service = new AutoRoleService(autoRoleRepo as unknown as AutoRoleRepository);
  });

  const createMockGuild = (botPosition = 10) => {
    const rolesCache = new Map();
    const botRole = { id: 'bot-role', name: 'BotRole', position: botPosition, managed: false };
    const memberRole = { id: 'role-member', name: 'Member', position: 5, managed: false };
    const adminRole = { id: 'role-admin', name: 'Admin', position: 15, managed: false };
    const managedRole = { id: 'role-managed', name: 'Integration', position: 3, managed: true };
    const everyoneRole = { id: 'guild-1', name: '@everyone', position: 0, managed: false };

    rolesCache.set('bot-role', botRole);
    rolesCache.set('role-member', memberRole);
    rolesCache.set('role-admin', adminRole);
    rolesCache.set('role-managed', managedRole);
    rolesCache.set('guild-1', everyoneRole);

    const botMember = {
      id: 'bot-id',
      roles: {
        highest: botRole,
        cache: new Map([['bot-role', botRole]]),
      },
      permissions: {
        has: vi.fn().mockImplementation((perm) => perm === PermissionFlagsBits.ManageRoles),
      },
    };

    const guild = {
      id: 'guild-1',
      ownerId: 'owner-id',
      roles: {
        cache: rolesCache,
      },
      members: {
        me: botMember,
        cache: new Map<string, any>([['bot-id', botMember]]),
        fetch: vi.fn(),
      },
      client: {
        user: { id: 'bot-id' },
      },
    };

    return { guild, botMember, rolesCache };
  };

  const createMockMember = (guild: any, userId = 'user-1', isBot = false, rolePosition = 1) => {
    const userRole = { id: 'user-role', name: 'UserRole', position: rolePosition };
    const rolesMap = new Map();

    return {
      id: userId,
      guild,
      user: { id: userId, bot: isBot, username: `user_${userId}` },
      roles: {
        highest: userRole,
        cache: rolesMap,
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    };
  };

  describe('Permission & Hierarchy Validation', () => {
    it('checks ManageRoles permission correctly', () => {
      const { guild, botMember } = createMockGuild();
      expect(service.hasManageRolesPermission(guild as any)).toBe(true);

      botMember.permissions.has.mockReturnValue(false);
      expect(service.hasManageRolesPermission(guild as any)).toBe(false);
    });

    it('validates assignable roles against @everyone, managed roles, and hierarchy', () => {
      const { guild } = createMockGuild(10);

      // @everyone
      expect(service.isValidAssignableRole(guild as any, 'guild-1').valid).toBe(false);

      // Managed role
      expect(service.isValidAssignableRole(guild as any, 'role-managed').valid).toBe(false);

      // Role higher than bot
      expect(service.isValidAssignableRole(guild as any, 'role-admin').valid).toBe(false);

      // Valid role below bot
      const valid = service.isValidAssignableRole(guild as any, 'role-member');
      expect(valid.valid).toBe(true);
      expect(valid.role?.id).toBe('role-member');
    });

    it('guards target member management based on owner and hierarchy', () => {
      const { guild } = createMockGuild(10);

      const regularMember = createMockMember(guild, 'user-1', false, 5);
      expect(service.canManageMember(guild as any, regularMember as any)).toBe(true);

      const ownerMember = createMockMember(guild, 'owner-id', false, 1);
      expect(service.canManageMember(guild as any, ownerMember as any)).toBe(false);

      const highRoleMember = createMockMember(guild, 'user-mod', false, 12);
      expect(service.canManageMember(guild as any, highRoleMember as any)).toBe(false);
    });
  });

  describe('Member Join AutoRoles', () => {
    it('assigns human roles to joining humans', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-new', false, 1);

      autoRoleRepo.getGuildAutoRoles.mockResolvedValue({
        guildId: 'guild-1',
        humanRoleIds: ['role-member'],
        botRoleIds: ['role-bot'],
        isEnabled: true,
      });

      const result = await service.handleMemberJoin(member as any);
      expect(result.success).toBe(true);
      expect(result.assignedRoles).toEqual(['role-member']);
      expect(member.roles.add).toHaveBeenCalled();
    });

    it('assigns bot roles to joining bots', async () => {
      const { guild, rolesCache } = createMockGuild(10);
      const botJoinRole = { id: 'role-bot-join', name: 'BotJoin', position: 2, managed: false };
      rolesCache.set('role-bot-join', botJoinRole);

      const botMember = createMockMember(guild, 'bot-new', true, 1);

      autoRoleRepo.getGuildAutoRoles.mockResolvedValue({
        guildId: 'guild-1',
        humanRoleIds: ['role-member'],
        botRoleIds: ['role-bot-join'],
        isEnabled: true,
      });

      const result = await service.handleMemberJoin(botMember as any);
      expect(result.success).toBe(true);
      expect(result.assignedRoles).toEqual(['role-bot-join']);
      expect(botMember.roles.add).toHaveBeenCalled();
    });

    it('skips disabled auto-role configuration', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-1', false, 1);

      autoRoleRepo.getGuildAutoRoles.mockResolvedValue({
        guildId: 'guild-1',
        humanRoleIds: ['role-member'],
        botRoleIds: [],
        isEnabled: false,
      });

      const result = await service.handleMemberJoin(member as any);
      expect(result.success).toBe(false);
      expect(member.roles.add).not.toHaveBeenCalled();
    });
  });

  describe('Verification Role Gateway', () => {
    it('verifies member and grants verification role', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-1', false, 1);

      autoRoleRepo.getGuildAutoRoles.mockResolvedValue({
        guildId: 'guild-1',
        verificationRoleId: 'role-member',
      });

      const result = await service.handleVerification(guild as any, member as any);
      expect(result.success).toBe(true);
      expect(result.alreadyVerified).toBe(false);
      expect(member.roles.add).toHaveBeenCalled();
    });

    it('informs already verified member without adding role again', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-1', false, 1);
      member.roles.cache.set('role-member', { id: 'role-member' });

      autoRoleRepo.getGuildAutoRoles.mockResolvedValue({
        guildId: 'guild-1',
        verificationRoleId: 'role-member',
      });

      const result = await service.handleVerification(guild as any, member as any);
      expect(result.success).toBe(true);
      expect(result.alreadyVerified).toBe(true);
      expect(member.roles.add).not.toHaveBeenCalled();
    });
  });

  describe('Temporary Roles & Sweeper', () => {
    it('assigns a temporary role and records in DB', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-1', false, 1);

      autoRoleRepo.addTemporaryRole.mockResolvedValue({
        id: 'temp-1',
        guildId: 'guild-1',
        userId: 'user-1',
        roleId: 'role-member',
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.assignTemporaryRole(
        guild as any,
        member as any,
        'role-member',
        60_000,
        'mod-1',
        'VIP access',
      );

      expect(result.success).toBe(true);
      expect(member.roles.add).toHaveBeenCalled();
      expect(autoRoleRepo.addTemporaryRole).toHaveBeenCalled();
    });

    it('sweeps expired roles across client guilds', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-expired', false, 1);
      member.roles.cache.set('role-member', { id: 'role-member' });

      guild.members.cache.set('user-expired', member);

      const client = {
        guilds: {
          cache: new Map([['guild-1', guild]]),
          fetch: vi.fn(),
        },
      };

      autoRoleRepo.findExpiredTemporaryRoles.mockResolvedValue([
        {
          id: 'temp-expired-1',
          guildId: 'guild-1',
          userId: 'user-expired',
          roleId: 'role-member',
        },
      ]);
      autoRoleRepo.removeTemporaryRole.mockResolvedValue(true);

      const sweepResult = await service.sweepExpiredRoles(client as any);
      expect(sweepResult.sweptCount).toBe(1);
      expect(member.roles.remove).toHaveBeenCalledWith('role-member', 'Temporary role expired');
      expect(autoRoleRepo.removeTemporaryRole).toHaveBeenCalledWith('temp-expired-1');
    });
  });
});
