import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { ReactionRoleService } from '../reaction-role.service.js';
import type { ReactionRoleRepository } from '@ririko/database';

describe('ReactionRoleService (TASK-1403)', () => {
  let reactionRoleRepo: {
    findById: ReturnType<typeof vi.fn>;
    findByMessageAndEmoji: ReturnType<typeof vi.fn>;
    findByMessageId: ReturnType<typeof vi.fn>;
    findByGuildId: ReturnType<typeof vi.fn>;
    findByGroup: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteByMessageId: ReturnType<typeof vi.fn>;
    deleteByMessageAndEmoji: ReturnType<typeof vi.fn>;
  };
  let service: ReactionRoleService;

  beforeEach(() => {
    reactionRoleRepo = {
      findById: vi.fn(),
      findByMessageAndEmoji: vi.fn(),
      findByMessageId: vi.fn(),
      findByGuildId: vi.fn(),
      findByGroup: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteByMessageId: vi.fn(),
      deleteByMessageAndEmoji: vi.fn(),
    };
    service = new ReactionRoleService(reactionRoleRepo as unknown as ReactionRoleRepository);
  });

  const createMockGuild = (botPosition = 10) => {
    const rolesCache = new Map();
    const botRole = { id: 'bot-role', name: 'BotRole', position: botPosition, managed: false };
    const gamerRole = { id: 'role-gamer', name: 'Gamer', position: 5, managed: false };
    const artistRole = { id: 'role-artist', name: 'Artist', position: 4, managed: false };
    const adminRole = { id: 'role-admin', name: 'Admin', position: 15, managed: false };
    const managedRole = { id: 'role-managed', name: 'Managed', position: 3, managed: true };
    const everyoneRole = { id: 'guild-1', name: '@everyone', position: 0, managed: false };

    rolesCache.set('bot-role', botRole);
    rolesCache.set('role-gamer', gamerRole);
    rolesCache.set('role-artist', artistRole);
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

  const createMockMember = (guild: any, userId = 'user-1', rolePosition = 1) => {
    const userRole = { id: 'user-role', name: 'UserRole', position: rolePosition };
    const rolesMap = new Map();

    return {
      id: userId,
      guild,
      user: { id: userId, bot: false, username: `user_${userId}` },
      roles: {
        highest: userRole,
        cache: rolesMap,
        add: vi.fn().mockImplementation((role) => {
          const r = typeof role === 'string' ? guild.roles.cache.get(role) : role;
          if (r) rolesMap.set(r.id, r);
          return Promise.resolve();
        }),
        remove: vi.fn().mockImplementation((role) => {
          const r = typeof role === 'string' ? guild.roles.cache.get(role) : role;
          if (r) rolesMap.delete(r.id);
          return Promise.resolve();
        }),
      },
    };
  };

  describe('Emoji Reaction Handling', () => {
    it('handles reaction add to assign role', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-1');

      reactionRoleRepo.findByMessageAndEmoji.mockResolvedValue({
        id: 'rr-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        messageId: 'msg-1',
        emojiOrComponentId: '🎮',
        roleId: 'role-gamer',
        mode: 'TOGGLE',
      });

      const result = await service.handleReactionAdd(guild as any, 'msg-1', '🎮', member as any);
      expect(result.success).toBe(true);
      expect(result.action).toBe('ADDED');
      expect(result.roleId).toBe('role-gamer');
      expect(member.roles.add).toHaveBeenCalled();
    });

    it('handles reaction remove to revoke role', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-1');
      member.roles.cache.set('role-gamer', { id: 'role-gamer', name: 'Gamer' });

      reactionRoleRepo.findByMessageAndEmoji.mockResolvedValue({
        id: 'rr-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        messageId: 'msg-1',
        emojiOrComponentId: '🎮',
        roleId: 'role-gamer',
        mode: 'TOGGLE',
      });

      const result = await service.handleReactionRemove(guild as any, 'msg-1', '🎮', member as any);
      expect(result.success).toBe(true);
      expect(result.action).toBe('REMOVED');
      expect(member.roles.remove).toHaveBeenCalled();
    });

    it('does not remove role on unreact if mode is GIVE_ONLY', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-1');
      member.roles.cache.set('role-gamer', { id: 'role-gamer', name: 'Gamer' });

      reactionRoleRepo.findByMessageAndEmoji.mockResolvedValue({
        id: 'rr-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        messageId: 'msg-1',
        emojiOrComponentId: '🎮',
        roleId: 'role-gamer',
        mode: 'GIVE_ONLY',
      });

      const result = await service.handleReactionRemove(guild as any, 'msg-1', '🎮', member as any);
      expect(result.success).toBe(true);
      expect(result.action).toBe('NOOP');
      expect(member.roles.remove).not.toHaveBeenCalled();
    });
  });

  describe('Interactive Button Component Roles', () => {
    it('toggles role on and off when clicking button', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-1');

      reactionRoleRepo.findById.mockResolvedValue({
        id: 'binding-1',
        guildId: 'guild-1',
        channelId: 'channel-1',
        messageId: 'msg-1',
        emojiOrComponentId: 'btn-gamer',
        roleId: 'role-gamer',
        mode: 'TOGGLE',
      });

      const mockInteraction = {
        guild,
        member,
        user: { id: 'user-1' },
        customId: 'rr:btn:binding-1',
        reply: vi.fn().mockResolvedValue(undefined),
      };

      // First click: adds role
      const addResult = await service.handleButtonInteraction(mockInteraction as any);
      expect(addResult.success).toBe(true);
      expect(addResult.action).toBe('ADDED');
      expect(member.roles.add).toHaveBeenCalled();

      // Second click: removes role
      const removeResult = await service.handleButtonInteraction(mockInteraction as any);
      expect(removeResult.success).toBe(true);
      expect(removeResult.action).toBe('REMOVED');
      expect(member.roles.remove).toHaveBeenCalled();
    });

    it('enforces UNIQUE mutually exclusive radio group', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-1');
      // User currently has gamer role
      member.roles.cache.set('role-gamer', { id: 'role-gamer', name: 'Gamer' });

      reactionRoleRepo.findByGroup.mockResolvedValue([
        { roleId: 'role-gamer' },
        { roleId: 'role-artist' },
      ]);

      const mockInteraction = {
        guild,
        member,
        user: { id: 'user-1' },
        customId: 'rr:btn:role:role-artist:UNIQUE:hobby-group',
        reply: vi.fn().mockResolvedValue(undefined),
      };

      const result = await service.handleButtonInteraction(mockInteraction as any);
      expect(result.success).toBe(true);
      expect(result.action).toBe('ADDED');
      expect(result.roleId).toBe('role-artist');
      // Should remove other role in the group
      expect(member.roles.remove).toHaveBeenCalledWith(['role-gamer'], expect.any(String));
      expect(member.roles.add).toHaveBeenCalled();
    });
  });

  describe('Interactive Dropdown Select Menu Roles', () => {
    it('assigns selected roles and removes unselected roles in group', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-1');
      member.roles.cache.set('role-gamer', { id: 'role-gamer', name: 'Gamer' });

      reactionRoleRepo.findByGroup.mockResolvedValue([
        { roleId: 'role-gamer' },
        { roleId: 'role-artist' },
      ]);

      const mockInteraction = {
        guild,
        member,
        user: { id: 'user-1' },
        values: ['role-artist'],
        customId: 'rr:select:group:hobby-group',
        reply: vi.fn().mockResolvedValue(undefined),
      };

      const results = await service.handleSelectMenuInteraction(mockInteraction as any);
      expect(results).toHaveLength(1);
      expect(results[0]?.roleId).toBe('role-artist');
      expect(member.roles.remove).toHaveBeenCalledWith(['role-gamer'], expect.any(String));
      expect(member.roles.add).toHaveBeenCalled();
    });

    it('ignores options whose binding was removed from the group (TASK-1642)', async () => {
      const { guild } = createMockGuild(10);
      const member = createMockMember(guild, 'user-1');
      reactionRoleRepo.findByGroup.mockResolvedValue([{ roleId: 'role-gamer' }]);

      const results = await service.handleSelectMenuInteraction({
        guild,
        member,
        user: { id: 'user-1' },
        values: ['role-gamer', 'role-artist'],
        customId: 'rr:select:group:hobby-group',
        reply: vi.fn().mockResolvedValue(undefined),
      } as any);

      expect(results.map((result) => result.roleId)).toEqual(['role-gamer']);
    });
  });
});
