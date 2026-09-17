import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { AutoVoiceService } from '../service.js';
import type { AutoVoiceRepository, AutoVoiceConfig } from '@ririko/database';

describe('AutoVoiceService (TASK-0911)', () => {
  let mockRepo: Partial<AutoVoiceRepository>;
  let service: AutoVoiceService;

  const sampleConfig: AutoVoiceConfig = {
    id: 'cfg-1',
    guildId: 'guild-1',
    parentChannelId: 'parent-vc-1',
    channelNameTemplate: '🔊 {user} Lounge',
    userLimit: 5,
    bitrate: 64000,
  };

  beforeEach(() => {
    mockRepo = {
      findByParentChannelId: vi.fn().mockImplementation((guildId: string, parentId: string) => {
        if (guildId === sampleConfig.guildId && parentId === sampleConfig.parentChannelId) {
          return Promise.resolve(sampleConfig);
        }
        return Promise.resolve(null);
      }),
      listByGuildId: vi.fn().mockImplementation((guildId: string) => {
        if (guildId === sampleConfig.guildId) {
          return Promise.resolve([sampleConfig]);
        }
        return Promise.resolve([]);
      }),
    };

    service = new AutoVoiceService(mockRepo as AutoVoiceRepository);
  });

  describe('Dynamic Voice Channel Provisioning', () => {
    it('creates a dynamic channel when member joins configured parent channel', async () => {
      const mockCreatedChannel: any = {
        id: 'new-child-vc-1',
        name: '🔊 Alice Lounge',
        type: ChannelType.GuildVoice,
        permissionOverwrites: {
          edit: vi.fn().mockResolvedValue({}),
        },
        delete: vi.fn().mockResolvedValue({}),
      };

      const mockParentChannel: any = {
        id: 'parent-vc-1',
        position: 3,
        parent: { id: 'category-1' },
        permissionOverwrites: {
          cache: new Map([
            [
              'role-1',
              { id: 'role-1', allow: BigInt(1024), deny: BigInt(0), type: 0 },
            ],
          ]),
        },
      };

      const mockGuild: any = {
        id: 'guild-1',
        channels: {
          create: vi.fn().mockResolvedValue(mockCreatedChannel),
          cache: new Map([['parent-vc-1', mockParentChannel]]),
        },
      };

      const mockMember: any = {
        id: 'user-alice',
        displayName: 'Alice',
        user: { username: 'alice_01' },
        voice: {
          setChannel: vi.fn().mockResolvedValue({}),
        },
      };

      const oldState: any = {
        channelId: null,
        guild: mockGuild,
      };

      const newState: any = {
        channelId: 'parent-vc-1',
        guild: mockGuild,
        member: mockMember,
        channel: mockParentChannel,
      };

      await service.handleVoiceStateUpdate(oldState, newState);

      // Verify channel creation arguments
      expect(mockGuild.channels.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '🔊 Alice Lounge',
          type: ChannelType.GuildVoice,
          userLimit: 5,
          bitrate: 64000,
        }),
      );

      // Verify owner permissions were granted
      expect(mockCreatedChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        'user-alice',
        expect.objectContaining({
          ViewChannel: true,
          Connect: true,
          Speak: true,
          ManageChannels: true,
        }),
      );

      // Verify user was moved to the new channel
      expect(mockMember.voice.setChannel).toHaveBeenCalledWith(mockCreatedChannel);

      // Verify channel is tracked as active
      const active = service.getActiveChannel('new-child-vc-1');
      expect(active).toBeDefined();
      expect(active?.ownerId).toBe('user-alice');
      expect(service.isOwner('new-child-vc-1', 'user-alice')).toBe(true);
      expect(service.isOwner('new-child-vc-1', 'user-bob')).toBe(false);
    });

    it('ignores joins to non-parent voice channels', async () => {
      const mockGuild: any = {
        id: 'guild-1',
        channels: {
          create: vi.fn(),
        },
      };

      const mockMember: any = {
        id: 'user-bob',
        displayName: 'Bob',
        user: { username: 'bob' },
        voice: { setChannel: vi.fn() },
      };

      const oldState: any = { channelId: null, guild: mockGuild };
      const newState: any = {
        channelId: 'regular-vc-99',
        guild: mockGuild,
        member: mockMember,
        channel: { id: 'regular-vc-99' },
      };

      await service.handleVoiceStateUpdate(oldState, newState);

      expect(mockGuild.channels.create).not.toHaveBeenCalled();
    });

    it('prevents concurrent double creation for the same user', async () => {
      const mockCreatedChannel: any = {
        id: 'child-1',
        name: 'Room',
        permissionOverwrites: { edit: vi.fn().mockResolvedValue({}) },
        delete: vi.fn(),
      };

      let resolveCreate: any;
      const createPromise = new Promise((resolve) => {
        resolveCreate = resolve;
      });

      const mockParentChannel: any = {
        id: 'parent-vc-1',
        position: 1,
        permissionOverwrites: { cache: new Map() },
      };

      const mockGuild: any = {
        id: 'guild-1',
        channels: {
          create: vi.fn().mockImplementation(() => createPromise.then(() => mockCreatedChannel)),
        },
      };

      const mockMember: any = {
        id: 'user-alice',
        displayName: 'Alice',
        user: { username: 'alice' },
        voice: { setChannel: vi.fn().mockResolvedValue({}) },
      };

      const oldState: any = { channelId: null, guild: mockGuild };
      const newState: any = {
        channelId: 'parent-vc-1',
        guild: mockGuild,
        member: mockMember,
        channel: mockParentChannel,
      };

      const p1 = service.handleVoiceStateUpdate(oldState, newState);
      const p2 = service.handleVoiceStateUpdate(oldState, newState);

      resolveCreate();
      await Promise.all([p1, p2]);

      expect(mockGuild.channels.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dynamic Channel Deletion on Empty', () => {
    it('deletes active dynamic channel when all members leave', async () => {
      // First register channel as active
      const mockChildChannel: any = {
        id: 'child-vc-1',
        name: 'Alice Lounge',
        members: new Map(), // 0 members left
        delete: vi.fn().mockResolvedValue({}),
      };

      const mockGuild: any = {
        id: 'guild-1',
        channels: {
          cache: new Map([['child-vc-1', mockChildChannel]]),
        },
      };

      // Manually register as active
      (service as any).activeChannels.set('child-vc-1', {
        channelId: 'child-vc-1',
        guildId: 'guild-1',
        parentChannelId: 'parent-vc-1',
        ownerId: 'user-alice',
        createdAt: new Date(),
        isLocked: false,
      });

      const oldState: any = {
        channelId: 'child-vc-1',
        channel: mockChildChannel,
        guild: mockGuild,
      };

      const newState: any = {
        channelId: null,
        guild: mockGuild,
      };

      await service.handleVoiceStateUpdate(oldState, newState);

      expect(mockChildChannel.delete).toHaveBeenCalled();
      expect(service.getActiveChannel('child-vc-1')).toBeUndefined();
    });

    it('does not delete active dynamic channel when other members remain', async () => {
      const mockChildChannel: any = {
        id: 'child-vc-1',
        name: 'Alice Lounge',
        members: new Map([['user-bob', {}]]), // 1 member remains
        delete: vi.fn().mockResolvedValue({}),
      };

      const mockGuild: any = {
        id: 'guild-1',
        channels: {
          cache: new Map([['child-vc-1', mockChildChannel]]),
        },
      };

      (service as any).activeChannels.set('child-vc-1', {
        channelId: 'child-vc-1',
        guildId: 'guild-1',
        parentChannelId: 'parent-vc-1',
        ownerId: 'user-alice',
        createdAt: new Date(),
        isLocked: false,
      });

      const oldState: any = {
        channelId: 'child-vc-1',
        channel: mockChildChannel,
        guild: mockGuild,
      };

      const newState: any = {
        channelId: null,
        guild: mockGuild,
      };

      await service.handleVoiceStateUpdate(oldState, newState);

      expect(mockChildChannel.delete).not.toHaveBeenCalled();
      expect(service.getActiveChannel('child-vc-1')).toBeDefined();
    });
  });

  describe('Orphan Cleanup', () => {
    it('scans and cleans up empty orphaned child channels but never deletes parents', async () => {
      const mockParentChannel: any = {
        id: 'parent-vc-1',
        type: ChannelType.GuildVoice,
        parentId: 'category-1',
        members: new Map(), // 0 members in parent
        delete: vi.fn(),
      };

      const mockOrphanChild: any = {
        id: 'orphan-vc-1',
        type: ChannelType.GuildVoice,
        parentId: 'category-1',
        members: new Map(), // 0 members in orphan child
        delete: vi.fn().mockResolvedValue({}),
      };

      const mockGuild: any = {
        id: 'guild-1',
        channels: {
          cache: new Map([
            ['parent-vc-1', mockParentChannel],
            ['orphan-vc-1', mockOrphanChild],
          ]),
        },
      };

      const deleted = await service.cleanupOrphans(mockGuild);

      expect(deleted).toBe(1);
      expect(mockParentChannel.delete).not.toHaveBeenCalled();
      expect(mockOrphanChild.delete).toHaveBeenCalled();
    });
  });

  describe('Channel Ownership & Management Controls', () => {
    it('allows owner transfer', () => {
      (service as any).activeChannels.set('vc-1', {
        channelId: 'vc-1',
        guildId: 'guild-1',
        parentChannelId: 'parent-1',
        ownerId: 'user-alice',
        createdAt: new Date(),
        isLocked: false,
      });

      expect(service.isOwner('vc-1', 'user-alice')).toBe(true);
      const transferred = service.transferOwnership('vc-1', 'user-bob');
      expect(transferred).toBe(true);
      expect(service.isOwner('vc-1', 'user-alice')).toBe(false);
      expect(service.isOwner('vc-1', 'user-bob')).toBe(true);
    });

    it('locks and unlocks channel modifying @everyone Connect permission', async () => {
      const mockChannel: any = {
        id: 'vc-1',
        guild: {
          roles: {
            everyone: 'role-everyone',
          },
        },
        permissionOverwrites: {
          edit: vi.fn().mockResolvedValue({}),
        },
      };

      (service as any).activeChannels.set('vc-1', {
        channelId: 'vc-1',
        guildId: 'guild-1',
        parentChannelId: 'parent-1',
        ownerId: 'user-alice',
        createdAt: new Date(),
        isLocked: false,
      });

      await service.lockChannel(mockChannel, true);
      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith('role-everyone', {
        Connect: false,
      });
      expect(service.getActiveChannel('vc-1')?.isLocked).toBe(true);

      await service.lockChannel(mockChannel, false);
      expect(mockChannel.permissionOverwrites.edit).toHaveBeenCalledWith('role-everyone', {
        Connect: null,
      });
      expect(service.getActiveChannel('vc-1')?.isLocked).toBe(false);
    });

    it('updates channel name, user limit, and bitrate', async () => {
      const mockChannel: any = {
        setName: vi.fn().mockResolvedValue({}),
        setUserLimit: vi.fn().mockResolvedValue({}),
        setBitrate: vi.fn().mockResolvedValue({}),
      };

      await service.setChannelName(mockChannel, 'Super Gaming Lounge');
      expect(mockChannel.setName).toHaveBeenCalledWith('Super Gaming Lounge');

      await service.setUserLimit(mockChannel, 8);
      expect(mockChannel.setUserLimit).toHaveBeenCalledWith(8);

      await service.setBitrate(mockChannel, 96000);
      expect(mockChannel.setBitrate).toHaveBeenCalledWith(96000);
    });
  });
});
