import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import type { Guild, GuildMember, TextChannel } from 'discord.js';
import { createEventBus } from '@ririko/core';
import type { CoreEvents } from '@ririko/core';
import type { ModerationRepository } from '@ririko/database';
import { PermissionService } from './permission.service.js';
import { ModerationActionService } from './moderation-action.service.js';

// Helper mock creator for Discord Guild, Member, and Channel objects
function createMockGuild(overrides: Partial<Record<string, unknown>> = {}) {
  const botMember: Record<string, unknown> = {
    id: 'bot_user_id',
    permissions: {
      has: vi.fn((_perm: bigint | string) => true),
    },
    roles: {
      highest: { position: 50 },
    },
  };

  const guild: Record<string, unknown> = {
    id: 'guild_123',
    name: 'Test Server',
    ownerId: 'owner_user_id',
    client: {
      user: { id: 'bot_user_id' },
    },
    members: {
      me: botMember,
      fetchMe: vi.fn().mockResolvedValue(botMember),
      ban: vi.fn().mockResolvedValue(undefined),
      unban: vi.fn().mockResolvedValue(undefined),
    },
    roles: {
      everyone: { id: 'everyone_role_id' },
    },
    ...overrides,
  };

  return guild as unknown as Guild;
}

function createMockMember(
  id: string,
  highestRolePos: number,
  permissions: bigint[] = [
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.ManageNicknames,
    PermissionFlagsBits.ManageChannels,
  ],
) {
  const permSet = new Set(permissions);
  const member: Record<string, unknown> = {
    id,
    user: { id, tag: `User#${id}`, username: `User_${id}` },
    roles: {
      highest: { position: highestRolePos },
    },
    permissions: {
      has: vi.fn((perm: bigint) => permSet.has(perm)),
    },
    kick: vi.fn().mockResolvedValue(undefined),
    timeout: vi.fn().mockResolvedValue(undefined),
    setNickname: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
  };

  return member as unknown as GuildMember;
}

function createMockChannel(id: string, name: string) {
  const channel: Record<string, unknown> = {
    id,
    name,
    permissionOverwrites: {
      edit: vi.fn().mockResolvedValue(undefined),
    },
    permissionsFor: vi.fn().mockReturnValue({
      has: vi.fn(() => true),
    }),
  };
  return channel as unknown as TextChannel;
}

describe('Moderation Subsystem — TASK-0701', () => {
  let permissionService: PermissionService;

  beforeEach(() => {
    permissionService = new PermissionService();
  });

  describe('PermissionService — 5-Tier Verification', () => {
    it('prevents self-moderation', async () => {
      const guild = createMockGuild();
      const member = createMockMember('user_1', 10);

      const result = await permissionService.validate({
        guild,
        invoker: member,
        target: member,
      });

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('CANNOT_MODERATE_SELF');
    });

    it('prevents moderating the guild owner', async () => {
      const guild = createMockGuild({ ownerId: 'owner_user' });
      const invoker = createMockMember('admin_user', 90);
      const owner = createMockMember('owner_user', 100);

      const result = await permissionService.validate({
        guild,
        invoker,
        target: owner,
      });

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('TARGET_IS_OWNER');
    });

    it('prevents moderating Ririko herself', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('admin_user', 90);
      const bot = createMockMember('bot_user_id', 50);

      const result = await permissionService.validate({
        guild,
        invoker,
        target: bot,
      });

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('CANNOT_MODERATE_SELF');
    });

    it('rejects invoker missing required Discord bitfield permissions', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 30, []); // no perms
      const target = createMockMember('target_user', 10);

      const result = await permissionService.validate({
        guild,
        invoker,
        target,
        requiredInvokerPermissions: [PermissionFlagsBits.BanMembers],
      });

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('INVOKER_MISSING_PERMISSIONS');
      expect(result.missingPermissions).toContain('BanMembers');
    });

    it('allows guild owner invoker to bypass invoker permission checks', async () => {
      const guild = createMockGuild({ ownerId: 'owner_id' });
      const ownerInvoker = createMockMember('owner_id', 1, []); // no explicit perms
      const target = createMockMember('target_user', 10);

      const result = await permissionService.validate({
        guild,
        invoker: ownerInvoker,
        target,
        requiredInvokerPermissions: [PermissionFlagsBits.BanMembers],
      });

      expect(result.allowed).toBe(true);
    });

    it('rejects bot missing required Discord bitfield permissions', async () => {
      const guild = createMockGuild();
      const botMember = (guild.members as unknown as { me: { permissions: { has: ReturnType<typeof vi.fn> } } }).me;
      botMember.permissions.has.mockReturnValue(false); // bot has no perms

      const invoker = createMockMember('admin_user', 40);
      const target = createMockMember('target_user', 10);

      const result = await permissionService.validate({
        guild,
        invoker,
        target,
        requiredBotPermissions: [PermissionFlagsBits.KickMembers],
      });

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('BOT_MISSING_PERMISSIONS');
    });

    it('enforces invoker role hierarchy above target', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 20);
      const target = createMockMember('target_user', 25); // higher role!

      const result = await permissionService.validate({
        guild,
        invoker,
        target,
      });

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('INVOKER_HIERARCHY_VIOLATION');
    });

    it('enforces bot role hierarchy above target', async () => {
      const guild = createMockGuild(); // bot role position is 50
      const invoker = createMockMember('admin_user', 90);
      const target = createMockMember('target_user', 60); // higher than bot (50)!

      const result = await permissionService.validate({
        guild,
        invoker,
        target,
      });

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('BOT_HIERARCHY_VIOLATION');
    });

    it('bypasses role hierarchy check when skipHierarchyCheck is true', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 10);
      const target = createMockMember('target_user', 50);

      const result = await permissionService.validate({
        guild,
        invoker,
        target,
        skipHierarchyCheck: true,
      });

      expect(result.allowed).toBe(true);
    });

    it('rejects when channel permission override denies bot action', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 40);
      const channel = createMockChannel('chan_1', 'general');
      (channel.permissionsFor as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        has: vi.fn(() => false), // Channel denies perm
      });

      const result = await permissionService.validate({
        guild,
        invoker,
        channel,
        requiredBotPermissions: [PermissionFlagsBits.ManageChannels],
      });

      expect(result.allowed).toBe(false);
      expect(result.code).toBe('CHANNEL_OVERRIDE_DENIED');
    });
  });

  describe('ModerationActionService — Discord Punitive Actions Core', () => {
    let mockRepo: { createCase: ReturnType<typeof vi.fn> };
    let eventBus: ReturnType<typeof createEventBus<CoreEvents>>;
    let actionService: ModerationActionService;

    beforeEach(() => {
      mockRepo = {
        createCase: vi.fn().mockImplementation(async (data) => ({
          id: 'case_uuid_1',
          caseNumber: 42,
          ...data,
          createdAt: new Date(),
        })),
      };
      eventBus = createEventBus<CoreEvents>();
      actionService = new ModerationActionService(
        permissionService,
        mockRepo as unknown as ModerationRepository,
        eventBus,
      );
    });

    it('kicks member, sends DM, writes DB case, and emits events', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 40);
      const target = createMockMember('target_user', 10);

      const eventSpy = vi.fn();
      eventBus.on('moderation:actionExecuted', eventSpy);

      const result = await actionService.kick({
        guild,
        invoker,
        target,
        reason: 'Violating rule 1',
        sendDm: true,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('KICK');
      expect(result.caseNumber).toBe(42);
      expect(result.dmSent).toBe(true);
      expect(target.send).toHaveBeenCalled();
      expect(target.kick).toHaveBeenCalledWith('[User#mod_user] Violating rule 1');
      expect(mockRepo.createCase).toHaveBeenCalledWith({
        guildId: guild.id,
        type: 'KICK',
        targetUserId: target.id,
        moderatorUserId: invoker.id,
        reason: 'Violating rule 1',
      });
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'KICK',
          guildId: guild.id,
          targetUserId: target.id,
          caseNumber: 42,
        }),
      );
    });

    it('bans user with message history purge (deleteMessageDays)', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('admin_user', 40);
      const target = createMockMember('target_user', 10);

      const result = await actionService.ban({
        guild,
        invoker,
        target,
        reason: 'Severe toxicity',
        deleteMessageDays: 2,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('BAN');
      expect(guild.members.ban).toHaveBeenCalledWith(target.id, {
        reason: '[User#admin_user] Severe toxicity',
        deleteMessageSeconds: 172800, // 2 * 86400
      });
    });

    it('bans user by ID string without requiring GuildMember', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('admin_user', 40);

      const result = await actionService.ban({
        guild,
        invoker,
        target: 'raw_user_id_999',
        reason: 'Pre-emptive ban',
      });

      expect(result.success).toBe(true);
      expect(guild.members.ban).toHaveBeenCalledWith('raw_user_id_999', {
        reason: '[User#admin_user] Pre-emptive ban',
        deleteMessageSeconds: 0,
      });
    });

    it('softbans member (bans to purge then unbans)', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 40);
      const target = createMockMember('target_user', 10);

      const result = await actionService.softban({
        guild,
        invoker,
        target,
        reason: 'Spam purge',
        deleteMessageDays: 1,
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('SOFTBAN');
      expect(guild.members.ban).toHaveBeenCalledWith(target.id, {
        reason: '[Softban by User#mod_user] Spam purge',
        deleteMessageSeconds: 86400,
      });
      expect(guild.members.unban).toHaveBeenCalledWith(
        target.id,
        '[Softban auto-unban by User#mod_user] Spam purge',
      );
      expect(mockRepo.createCase).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SOFTBAN' }),
      );
    });

    it('unbans a previously banned user', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('admin_user', 40);

      const result = await actionService.unban({
        guild,
        invoker,
        targetUserId: 'banned_user_1',
        reason: 'Successful ban appeal',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('UNBAN');
      expect(guild.members.unban).toHaveBeenCalledWith(
        'banned_user_1',
        '[Unban by User#admin_user] Successful ban appeal',
      );
    });

    it('applies timeout and clamps duration to valid bounds', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 40);
      const target = createMockMember('target_user', 10);

      const result = await actionService.timeout({
        guild,
        invoker,
        target,
        durationSeconds: 300, // 5m
        reason: 'Cool down',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('TIMEOUT');
      expect(target.timeout).toHaveBeenCalledWith(300000, '[User#mod_user] Cool down');
      expect(mockRepo.createCase).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TIMEOUT',
          durationSeconds: 300,
        }),
      );
    });

    it('removes timeout via untimeout', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 40);
      const target = createMockMember('target_user', 10);

      const result = await actionService.untimeout({
        guild,
        invoker,
        target,
        reason: 'Timeout lifted early',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('UNTIMEOUT');
      expect(target.timeout).toHaveBeenCalledWith(
        null,
        '[Untimeout by User#mod_user] Timeout lifted early',
      );
    });

    it('changes or resets member nickname', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 40);
      const target = createMockMember('target_user', 10);

      const result = await actionService.setNickname({
        guild,
        invoker,
        target,
        nickname: 'Moderated Name',
        reason: 'Inappropriate display name',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('NICK');
      expect(target.setNickname).toHaveBeenCalledWith(
        'Moderated Name',
        '[Nickname moderated by User#mod_user] Inappropriate display name',
      );
    });

    it('locks and unlocks channels by updating @everyone permissions', async () => {
      const guild = createMockGuild();
      const invoker = createMockMember('mod_user', 40);
      const channel = createMockChannel('chan_123', 'general');

      const lockResult = await actionService.lockChannel({
        guild,
        invoker,
        channel,
        reason: 'Raid lockdown',
      });

      expect(lockResult.success).toBe(true);
      expect(lockResult.action).toBe('LOCK');
      expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
        guild.roles.everyone,
        { SendMessages: false },
        { reason: '[Lock by User#mod_user] Raid lockdown' },
      );

      const unlockResult = await actionService.unlockChannel({
        guild,
        invoker,
        channel,
        reason: 'Raid resolved',
      });

      expect(unlockResult.success).toBe(true);
      expect(unlockResult.action).toBe('UNLOCK');
      expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
        guild.roles.everyone,
        { SendMessages: null },
        { reason: '[Unlock by User#mod_user] Raid resolved' },
      );
    });
  });
});
