import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChannelType } from 'discord.js';
import { AutoVoiceChannelRepository, createDatabaseClient } from '@ririko/database';
import type { AutoVoiceRepository, AutoVoiceConfig, SqliteDatabaseClient } from '@ririko/database';
import { SQLITE_SCHEMA_DDL } from '../../../../database/src/schema/sqlite/ddl.js';
import { AutoVoiceService } from '../service.js';

describe('AutoVoiceService (TASK-0911)', () => {
  let mockRepo: Partial<AutoVoiceRepository>;
  let client: SqliteDatabaseClient;
  let channelRepo: AutoVoiceChannelRepository;
  let service: AutoVoiceService;

  const sampleConfig: AutoVoiceConfig = {
    id: 'cfg-1',
    guildId: 'guild-1',
    parentChannelId: 'parent-vc-1',
    channelNameTemplate: '🔊 {user} Lounge',
    userLimit: 5,
    bitrate: 64000,
  };

  beforeEach(async () => {
    const raw = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;
    client.raw.exec(SQLITE_SCHEMA_DDL);
    channelRepo = new AutoVoiceChannelRepository(client);

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

    service = new AutoVoiceService(mockRepo as AutoVoiceRepository, channelRepo);
  });

  afterEach(async () => {
    await client.close();
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
            ['role-1', { id: 'role-1', allow: BigInt(1024), deny: BigInt(0), type: 0 }],
          ]),
        },
      };

      const mockGuild: any = {
        id: 'guild-1',
        maximumBitrate: 96000,
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

      // Verify channel is recorded as created by the service
      const record = await channelRepo.findById('new-child-vc-1');
      expect(record?.guildId).toBe('guild-1');
      expect(record?.parentChannelId).toBe('parent-vc-1');
    });

    it('lowers a saved bitrate to what the guild allows now (TASK-1641)', async () => {
      vi.mocked(mockRepo.findByParentChannelId!).mockResolvedValueOnce({
        ...sampleConfig,
        bitrate: 256000,
      });
      const created: any = {
        id: 'new-child-vc-2',
        permissionOverwrites: { edit: vi.fn().mockResolvedValue({}) },
        delete: vi.fn(),
      };
      const guild: any = {
        id: 'guild-1',
        maximumBitrate: 96000,
        channels: { create: vi.fn().mockResolvedValue(created), cache: new Map() },
      };
      const member: any = {
        id: 'user-carol',
        displayName: 'Carol',
        user: { username: 'carol' },
        voice: { setChannel: vi.fn().mockResolvedValue({}) },
      };

      await service.handleVoiceStateUpdate(
        { channelId: null, guild } as any,
        {
          channelId: 'parent-vc-1',
          guild,
          member,
          channel: { id: 'parent-vc-1', position: 0 },
        } as any,
      );

      expect(guild.channels.create).toHaveBeenCalledWith(
        expect.objectContaining({ bitrate: 96000 }),
      );
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

  describe('Created Channel Record (BUG-0021)', () => {
    const voiceChannel = (id: string, memberCount = 0): any => ({
      id,
      type: ChannelType.GuildVoice,
      parentId: 'category-1',
      parent: { id: 'category-1' },
      members: new Map(Array.from({ length: memberCount }, (_, i) => [`member-${i}`, {}])),
      delete: vi.fn().mockResolvedValue({}),
    });

    const guildWith = (...channels: any[]): any => ({
      id: 'guild-1',
      channels: { cache: new Map(channels.map((c) => [c.id, c])) },
    });

    const leave = (guild: any, channel: any) =>
      service.handleVoiceStateUpdate(
        { channelId: channel.id, channel, guild } as any,
        { channelId: null, guild } as any,
      );

    const recordChannel = (channelId: string) =>
      channelRepo.create({ channelId, guildId: 'guild-1', parentChannelId: 'parent-vc-1' });

    it('never deletes a permanent empty channel in the hub category on leave', async () => {
      const hub = voiceChannel('parent-vc-1');
      const permanent = voiceChannel('permanent-vc-1');
      const guild = guildWith(hub, permanent);

      await leave(guild, permanent);

      expect(permanent.delete).not.toHaveBeenCalled();
    });

    it('never deletes a permanent empty channel in the hub category at startup cleanup', async () => {
      const hub = voiceChannel('parent-vc-1');
      const permanent = voiceChannel('permanent-vc-1');
      const guild = guildWith(hub, permanent);

      const deleted = await service.cleanupOrphans(guild);

      expect(deleted).toBe(0);
      expect(hub.delete).not.toHaveBeenCalled();
      expect(permanent.delete).not.toHaveBeenCalled();
    });

    it('deletes a bot-created empty channel on leave after a simulated restart', async () => {
      await recordChannel('child-vc-1');
      const restarted = new AutoVoiceService(mockRepo as AutoVoiceRepository, channelRepo);
      service = restarted;
      const child = voiceChannel('child-vc-1');
      const guild = guildWith(voiceChannel('parent-vc-1'), child);

      await leave(guild, child);

      expect(child.delete).toHaveBeenCalled();
      expect(await channelRepo.exists('child-vc-1')).toBe(false);
    });

    it('deletes only empty bot-created channels at startup cleanup after a simulated restart', async () => {
      await recordChannel('child-empty');
      await recordChannel('child-occupied');
      await recordChannel('child-gone');
      const restarted = new AutoVoiceService(mockRepo as AutoVoiceRepository, channelRepo);
      const hub = voiceChannel('parent-vc-1');
      const permanent = voiceChannel('permanent-vc-1');
      const empty = voiceChannel('child-empty');
      const occupied = voiceChannel('child-occupied', 1);
      const guild = guildWith(hub, permanent, empty, occupied);

      const deleted = await restarted.cleanupOrphans(guild);

      expect(deleted).toBe(1);
      expect(empty.delete).toHaveBeenCalled();
      expect(occupied.delete).not.toHaveBeenCalled();
      expect(hub.delete).not.toHaveBeenCalled();
      expect(permanent.delete).not.toHaveBeenCalled();
      expect(await channelRepo.exists('child-empty')).toBe(false);
      expect(await channelRepo.exists('child-occupied')).toBe(true);
      expect(await channelRepo.exists('child-gone')).toBe(false);
    });

    it('forgets a channel that is already gone on Discord but keeps it on other delete failures', async () => {
      await recordChannel('child-unknown');
      await recordChannel('child-forbidden');
      const unknown = voiceChannel('child-unknown');
      unknown.delete.mockRejectedValue(
        Object.assign(new Error('Unknown Channel'), { code: 10003 }),
      );
      const forbidden = voiceChannel('child-forbidden');
      forbidden.delete.mockRejectedValue(
        Object.assign(new Error('Missing Permissions'), { code: 50013 }),
      );
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const deleted = await service.cleanupOrphans(guildWith(unknown, forbidden));

      expect(deleted).toBe(1);
      expect(await channelRepo.exists('child-unknown')).toBe(false);
      expect(await channelRepo.exists('child-forbidden')).toBe(true);
      errorSpy.mockRestore();
    });

    it('forgets a created channel deleted outside the service', async () => {
      await recordChannel('child-vc-1');

      await service.handleChannelDelete('child-vc-1');

      expect(await channelRepo.exists('child-vc-1')).toBe(false);
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
