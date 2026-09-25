import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAutoVoiceCommands } from '../autovoice.command.js';
import type { BotServices } from '../../../services.js';
import type { AutoVoiceConfig } from '@ririko/database';

describe('Auto-Voice Commands Suite (TASK-0912)', () => {
  let mockServices: Partial<BotServices>;

  const sampleConfig: AutoVoiceConfig = {
    id: 'cfg-1',
    guildId: 'guild-1',
    parentChannelId: 'parent-vc-1',
    channelNameTemplate: '🔊 {user} Room',
    userLimit: 4,
    bitrate: 64000,
  };

  beforeEach(() => {
    mockServices = {
      autoVoiceRepo: {
        findById: vi.fn().mockResolvedValue(sampleConfig),
        findByParentChannelId: vi.fn().mockResolvedValue(sampleConfig),
        listByGuildId: vi.fn().mockResolvedValue([sampleConfig]),
        create: vi.fn().mockResolvedValue(sampleConfig),
        upsert: vi.fn().mockResolvedValue(sampleConfig),
        update: vi.fn().mockResolvedValue(sampleConfig),
        delete: vi.fn().mockResolvedValue(true),
        deleteByParentChannelId: vi.fn().mockResolvedValue(true),
        exists: vi.fn().mockResolvedValue(true),
        count: vi.fn().mockResolvedValue(1),
      } as any,
      autoVoiceService: {
        getActiveChannel: vi.fn().mockImplementation((channelId: string) => {
          if (channelId === 'active-child-vc') {
            return {
              channelId: 'active-child-vc',
              guildId: 'guild-1',
              parentChannelId: 'parent-vc-1',
              ownerId: 'user-alice',
              createdAt: new Date(),
              isLocked: false,
            };
          }
          return undefined;
        }),
        isOwner: vi.fn().mockImplementation((channelId: string, userId: string) => {
          return channelId === 'active-child-vc' && userId === 'user-alice';
        }),
        transferOwnership: vi.fn().mockReturnValue(true),
        setChannelName: vi.fn().mockResolvedValue(undefined),
        setUserLimit: vi.fn().mockResolvedValue(undefined),
        setBitrate: vi.fn().mockResolvedValue(undefined),
        lockChannel: vi.fn().mockResolvedValue(undefined),
        cleanupOrphans: vi.fn().mockResolvedValue(0),
        handleVoiceStateUpdate: vi.fn().mockResolvedValue(undefined),
      } as any,
    };
  });

  describe('Command Registration & Aliases', () => {
    it('registers /autovoice, /voice, and all legacy aliases', () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      expect(commands.length).toBeGreaterThanOrEqual(10);

      const names = commands.map((c) => c.metadata.name);
      expect(names).toContain('autovoice');
      expect(names).toContain('voice');
      expect(names).toContain('avc');
      expect(names).toContain('vname');
      expect(names).toContain('vlimit');
      expect(names).toContain('vlock');
      expect(names).toContain('vunlock');
      expect(names).toContain('vpermit');
      expect(names).toContain('vkick');
      expect(names).toContain('vclaim');
      expect(names).toContain('vtransfer');
    });
  });

  describe('/autovoice Configuration Commands', () => {
    function createMockContext(
      action: string,
      options: Record<string, any> = {},
      hasAdmin = true,
      rawArgs: string[] = [],
    ): any {
      return {
        guildId: 'guild-1',
        user: { id: 'user-admin' },
        member: {
          permissions: {
            has: vi.fn().mockReturnValue(hasAdmin),
          },
        },
        options: {
          getString: vi.fn().mockImplementation((name: string) => {
            if (name === 'action') return action;
            return options[name] ?? null;
          }),
          getInteger: vi.fn().mockImplementation((name: string) => options[name] ?? null),
          getChannel: vi.fn().mockResolvedValue(options.channel ?? null),
          getUser: vi.fn().mockResolvedValue(options.user ?? null),
          getBoolean: vi.fn().mockImplementation((name: string) => options[name] ?? null),
          getRawArgs: vi.fn().mockReturnValue([action, ...rawArgs]),
        },
        reply: vi.fn().mockResolvedValue({}),
      };
    }

    it('enforces ManageChannels or ManageServer permission for configuration', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'autovoice')!;

      const mockCtx = createMockContext('setup', {}, false);
      await cmd.execute(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('permission'),
        }),
      );
    });

    it('sets up a Join-to-Create voice channel', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'autovoice')!;

      const mockTargetChannel = { id: 'parent-vc-1', name: 'Join to Create' };
      const mockCtx = createMockContext('setup', {
        channel: mockTargetChannel,
        template: '🎵 {user} Hangout',
        limit: 8,
        bitrate: 96000,
      });

      await cmd.execute(mockCtx);

      expect(mockServices.autoVoiceRepo!.upsert).toHaveBeenCalledWith({
        guildId: 'guild-1',
        parentChannelId: 'parent-vc-1',
        channelNameTemplate: '🎵 {user} Hangout',
        userLimit: 8,
        bitrate: 96000,
      });

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('removes an existing Join-to-Create voice channel', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'autovoice')!;

      const mockTargetChannel = { id: 'parent-vc-1' };
      const mockCtx = createMockContext('remove', {
        channel: mockTargetChannel,
      });

      await cmd.execute(mockCtx);

      expect(mockServices.autoVoiceRepo!.deleteByParentChannelId).toHaveBeenCalledWith(
        'guild-1',
        'parent-vc-1',
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Removed'),
        }),
      );
    });

    it('lists all configured auto-voice channels', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'autovoice')!;

      const mockCtx = createMockContext('list');
      await cmd.execute(mockCtx);

      expect(mockServices.autoVoiceRepo!.listByGuildId).toHaveBeenCalledWith('guild-1');
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });
  });

  describe('/voice Channel Owner In-Channel Controls', () => {
    function createVoiceControlContext(
      callerId: string,
      action: string,
      options: Record<string, any> = {},
      inVoice = true,
      isDynamic = true,
      rawArgs: string[] = [],
    ): any {
      const mockVoiceChannel: any = {
        id: isDynamic ? 'active-child-vc' : 'regular-vc',
        name: 'Alice Lounge',
        members: new Map([
          ['user-alice', { id: 'user-alice' }],
          ['user-bob', { id: 'user-bob', voice: { disconnect: vi.fn().mockResolvedValue({}) } }],
        ]),
        permissionOverwrites: {
          edit: vi.fn().mockResolvedValue({}),
        },
      };

      return {
        guildId: 'guild-1',
        user: { id: callerId },
        member: {
          voice: {
            channel: inVoice ? mockVoiceChannel : null,
          },
        },
        options: {
          getString: vi.fn().mockImplementation((name: string) => {
            if (name === 'action') return action;
            return options[name] ?? null;
          }),
          getInteger: vi.fn().mockImplementation((name: string) => options[name] ?? null),
          getUser: vi.fn().mockResolvedValue(options.user ?? null),
          getBoolean: vi.fn().mockImplementation((name: string) => options[name] ?? null),
          getRawArgs: vi.fn().mockReturnValue([action, ...rawArgs]),
        },
        reply: vi.fn().mockResolvedValue({}),
      };
    }

    it('rejects controls if user is not in a voice channel', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'voice')!;

      const ctx = createVoiceControlContext('user-alice', 'name', { name: 'New Name' }, false);
      await cmd.execute(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('must be connected to a voice channel'),
        }),
      );
    });

    it('rejects controls if voice channel is not dynamic', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'voice')!;

      const ctx = createVoiceControlContext(
        'user-alice',
        'name',
        { name: 'New Name' },
        true,
        false,
      );
      await cmd.execute(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('not a temporary dynamic voice channel'),
        }),
      );
    });

    it('rejects non-owner trying to manage channel', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'voice')!;

      const ctx = createVoiceControlContext('user-bob', 'name', { name: 'Bob Room' });
      await cmd.execute(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Only the channel owner'),
        }),
      );
    });

    it('allows owner to rename channel', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'voice')!;

      const ctx = createVoiceControlContext('user-alice', 'name', { name: 'Chill Vibez' });
      await cmd.execute(ctx);

      expect(mockServices.autoVoiceService!.setChannelName).toHaveBeenCalledWith(
        ctx.member.voice.channel,
        'Chill Vibez',
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Chill Vibez'),
        }),
      );
    });

    it('allows owner to set user limit', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'voice')!;

      const ctx = createVoiceControlContext('user-alice', 'limit', { limit: 10 });
      await cmd.execute(ctx);

      expect(mockServices.autoVoiceService!.setUserLimit).toHaveBeenCalledWith(
        ctx.member.voice.channel,
        10,
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('10'),
        }),
      );
    });

    it('allows owner to lock and unlock channel', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'voice')!;

      const ctxLock = createVoiceControlContext('user-alice', 'lock', { locked: true });
      await cmd.execute(ctxLock);

      expect(mockServices.autoVoiceService!.lockChannel).toHaveBeenCalledWith(
        ctxLock.member.voice.channel,
        true,
      );

      const ctxUnlock = createVoiceControlContext('user-alice', 'lock', { locked: false });
      await cmd.execute(ctxUnlock);

      expect(mockServices.autoVoiceService!.lockChannel).toHaveBeenCalledWith(
        ctxUnlock.member.voice.channel,
        false,
      );
    });

    it('allows owner to permit a specific user', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'voice')!;

      const ctx = createVoiceControlContext('user-alice', 'permit', {
        user: { id: 'user-carol' },
      });
      await cmd.execute(ctx);

      expect(ctx.member.voice.channel.permissionOverwrites.edit).toHaveBeenCalledWith(
        'user-carol',
        expect.objectContaining({ Connect: true, ViewChannel: true }),
      );
    });

    it('allows owner to kick/disconnect another user from the channel', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'voice')!;

      const ctx = createVoiceControlContext('user-alice', 'kick', {
        user: { id: 'user-bob' },
      });
      await cmd.execute(ctx);

      const targetMember = ctx.member.voice.channel.members.get('user-bob');
      expect(targetMember.voice.disconnect).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Disconnected'),
        }),
      );
    });

    it('prevents owner from kicking themselves', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'voice')!;

      const ctx = createVoiceControlContext('user-alice', 'kick', {
        user: { id: 'user-alice' },
      });
      await cmd.execute(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('cannot kick yourself'),
        }),
      );
    });

    it('allows claiming ownership if current owner left', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'voice')!;

      const ctx = createVoiceControlContext('user-bob', 'claim');
      // Simulate owner left: user-alice is no longer in members map
      ctx.member.voice.channel.members.delete('user-alice');

      await cmd.execute(ctx);

      expect(mockServices.autoVoiceService!.transferOwnership).toHaveBeenCalledWith(
        'active-child-vc',
        'user-bob',
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('claimed ownership'),
        }),
      );
    });

    it('allows owner to transfer ownership to another present member', async () => {
      const commands = createAutoVoiceCommands(mockServices as BotServices);
      const cmd = commands.find((c) => c.metadata.name === 'voice')!;

      const ctx = createVoiceControlContext('user-alice', 'transfer', {
        user: { id: 'user-bob' },
      });
      await cmd.execute(ctx);

      expect(mockServices.autoVoiceService!.transferOwnership).toHaveBeenCalledWith(
        'active-child-vc',
        'user-bob',
      );
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Transferred channel ownership'),
        }),
      );
    });
  });
});
