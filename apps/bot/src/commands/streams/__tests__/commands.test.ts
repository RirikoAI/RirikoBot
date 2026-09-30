import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { createStreamCommands } from '../stream.command.js';
import { createFreeGamesCommand } from '../free-games.command.js';
import type { BotServices } from '../../../services.js';

const SHROUD = {
  id: 'twitch_shroud',
  platform: 'TWITCH',
  platformUserId: 'shroud',
  username: 'shroud',
  displayName: 'shroud',
  avatarUrl: null,
  isLive: true,
};
const SHROUD_SUB = {
  id: 'sub_1',
  streamerId: 'twitch_shroud',
  guildId: 'guild-1',
  channelId: 'channel-1',
  mentionRoleId: null,
  customMessage: null,
};

describe('Streams & Free Games Commands Suite (STORY-081)', () => {
  let mockServices: Partial<BotServices>;

  beforeEach(() => {
    mockServices = {
      streamRepo: {
        upsertStreamer: vi.fn().mockResolvedValue({
          id: 'twitch_shroud',
          platform: 'TWITCH',
          platformUserId: 'shroud',
          username: 'shroud',
          displayName: 'shroud',
          avatarUrl: 'https://example.com/shroud.jpg',
          isLive: false,
          lastCheckedAt: new Date(),
        }),
        addSubscription: vi.fn().mockResolvedValue({}),
        removeSubscription: vi.fn().mockResolvedValue(true),
        findByUsername: vi.fn().mockResolvedValue({
          id: 'twitch_shroud',
          platform: 'TWITCH',
          platformUserId: 'shroud',
          username: 'shroud',
          displayName: 'shroud',
        }),
        findById: vi.fn().mockResolvedValue({
          id: 'twitch_shroud',
          platform: 'TWITCH',
          platformUserId: 'shroud',
          username: 'shroud',
          displayName: 'shroud',
          isLive: true,
        }),
        getSubscriptionsByGuild: vi.fn().mockResolvedValue([
          {
            id: 'sub_1',
            streamerId: 'twitch_shroud',
            guildId: 'guild-1',
            channelId: 'channel-1',
            mentionRoleId: null,
            customMessage: null,
          },
        ]),
      } as any,
      streamAlertService: {
        list: vi.fn().mockResolvedValue([{ subscription: SHROUD_SUB, streamer: SHROUD }]),
        subscribe: vi.fn().mockResolvedValue({
          alert: { subscription: SHROUD_SUB, streamer: SHROUD },
          created: true,
        }),
        remove: vi.fn().mockResolvedValue({ subscription: SHROUD_SUB, streamer: SHROUD }),
      } as any,
      streamWatcher: {
        getAdapter: vi.fn().mockReturnValue({
          platform: 'TWITCH',
          resolveStreamer: vi.fn().mockResolvedValue({
            platform: 'TWITCH',
            platformUserId: '123456',
            username: 'shroud',
            displayName: 'shroud',
            avatarUrl: 'https://example.com/shroud.jpg',
          }),
        }),
      } as any,
      freeGameRepo: {
        getGuildChannel: vi.fn().mockResolvedValue({
          guildId: 'guild-1',
          channelId: 'channel-free-1',
          mentionRoleId: null,
        }),
        setGuildChannel: vi.fn().mockResolvedValue({
          guildId: 'guild-1',
          channelId: 'channel-free-2',
          mentionRoleId: null,
        }),
        removeGuildChannel: vi.fn().mockResolvedValue(true),
      } as any,
      freeGamesEngine: {
        pollFreeGames: vi.fn().mockResolvedValue([
          {
            id: 'epic-game-1',
            provider: 'EPIC',
            title: 'Test Free Epic Game',
            storeUrl: 'https://store.epicgames.com/p/test-game',
            thumbnailUrl: 'https://example.com/epic.jpg',
            startDate: new Date('2026-09-17T00:00:00.000Z'),
            endDate: new Date('2026-09-24T00:00:00.000Z'),
            originalPrice: '$19.99',
            isUpcoming: false,
          },
        ]),
        formatGameEmbed: vi.fn().mockReturnValue({
          title: '🎮 Free Game: Test Free Epic Game',
          url: 'https://store.epicgames.com/p/test-game',
          description:
            '**[Claim on Epic Games](https://store.epicgames.com/p/test-game)**\n\n💰 **Original Price:** ~~$19.99~~ **FREE!**',
          color: 0x0078f2,
        }),
      } as any,
    };
  });

  describe('Stream Alerts Commands (/stream, !subscribe, !unsubscribe, !setup-stream-notification, !stream-status)', () => {
    it('should register 5 stream commands including generalized names and legacy aliases', () => {
      const commands = createStreamCommands(mockServices as BotServices);
      expect(commands).toHaveLength(5);
      const names = commands.map((c) => c.metadata.name);
      expect(names).toContain('stream');
      expect(names).toContain('subscribe');
      expect(names).toContain('unsubscribe');
      expect(names).toContain('setup-stream-notification');
      expect(names).toContain('stream-status');

      const slash = commands.filter((c) => c.metadata.slashEnabled !== false);
      expect(slash.map((c) => c.metadata.name)).toEqual([
        'stream',
        'setup-stream-notification',
        'stream-status',
      ]);

      const setupCmd = commands.find((c) => c.metadata.name === 'setup-stream-notification')!;
      expect(setupCmd.metadata.aliases).toContain('setup-twitch');

      const statusCmd = commands.find((c) => c.metadata.name === 'stream-status')!;
      expect(statusCmd.metadata.aliases).toContain('twitch-status');
    });

    it('subscribing to a streamer requires ManageGuild permissions', async () => {
      const commands = createStreamCommands(mockServices as BotServices);
      const streamCmd = commands.find((c) => c.metadata.name === 'stream')!;

      const mockCtx: any = {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        member: {
          permissions: {
            has: vi.fn().mockReturnValue(false),
          },
        },
        options: {
          getString: vi.fn().mockImplementation((name) => (name === 'action' ? 'subscribe' : null)),
          getRawArgs: vi.fn().mockReturnValue(['subscribe', 'shroud']),
        },
        reply: vi.fn(),
      };

      await streamCmd.execute(mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Manage Server'),
        }),
      );
    });

    it('successfully subscribes to a streamer and adds subscription', async () => {
      const commands = createStreamCommands(mockServices as BotServices);
      const streamCmd = commands.find((c) => c.metadata.name === 'stream')!;

      const mockCtx: any = {
        guildId: 'guild-1',
        channelId: 'channel-1',
        channel: { id: 'channel-1' },
        user: { id: 'user-1' },
        member: {
          permissions: {
            has: vi.fn().mockImplementation((perm) => perm === PermissionFlagsBits.ManageGuild),
          },
        },
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'action') return 'subscribe';
            if (name === 'streamer') return 'shroud';
            if (name === 'platform') return 'TWITCH';
            return null;
          }),
          getChannel: vi.fn().mockResolvedValue(null),
          getRole: vi.fn().mockReturnValue(null),
          getRawArgs: vi.fn().mockReturnValue([]),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn(),
      };

      await streamCmd.execute(mockCtx);

      expect(mockCtx.deferReply).toHaveBeenCalled();
      expect(mockServices.streamAlertService?.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-1',
          streamer: 'shroud',
          platform: 'TWITCH',
          channelId: 'channel-1',
          mentionRoleId: null,
        }),
        { userId: 'user-1', source: 'command' },
      );
      expect(mockCtx.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('lists subscribed streamers in server with live status', async () => {
      const commands = createStreamCommands(mockServices as BotServices);
      const streamCmd = commands.find((c) => c.metadata.name === 'stream')!;

      const mockCtx: any = {
        guildId: 'guild-1',
        options: {
          getString: vi.fn().mockReturnValue('list'),
          getRawArgs: vi.fn().mockReturnValue(['list']),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await streamCmd.execute(mockCtx);

      expect(mockServices.streamAlertService?.list).toHaveBeenCalledWith('guild-1');
      expect(mockCtx.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('reads the platform, channel and role from prefix arguments', async () => {
      const commands = createStreamCommands(mockServices as BotServices);
      const subscribeCmd = commands.find((c) => c.metadata.name === 'subscribe')!;

      const mockCtx: any = {
        source: 'prefix',
        guildId: 'guild-1',
        channelId: 'channel-1',
        user: { id: 'user-1' },
        member: { permissions: { has: vi.fn().mockReturnValue(true) } },
        options: {
          getString: vi.fn().mockReturnValue(null),
          getChannel: vi.fn().mockResolvedValue(null),
          getRawArgs: vi
            .fn()
            .mockReturnValue([
              'LofiGirl',
              'youtube',
              '<#123456789012345678>',
              '<@&223456789012345678>',
            ]),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn(),
      };

      await subscribeCmd.execute(mockCtx);

      expect(mockServices.streamAlertService?.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          streamer: 'LofiGirl',
          platform: 'YOUTUBE',
          channelId: '123456789012345678',
          mentionRoleId: '223456789012345678',
        }),
        expect.anything(),
      );
    });

    it('unsubscribes a streamer from the server', async () => {
      const commands = createStreamCommands(mockServices as BotServices);
      const streamCmd = commands.find((c) => c.metadata.name === 'stream')!;

      const mockCtx: any = {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        member: {
          permissions: {
            has: vi.fn().mockReturnValue(true),
          },
        },
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'action') return 'unsubscribe';
            if (name === 'streamer') return 'shroud';
            return null;
          }),
          getRawArgs: vi.fn().mockReturnValue([]),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await streamCmd.execute(mockCtx);

      expect(mockServices.streamAlertService?.remove).toHaveBeenCalledWith(
        'guild-1',
        'sub_1',
        expect.objectContaining({ source: 'command' }),
      );
      expect(mockCtx.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Successfully unsubscribed'),
        }),
      );
    });

    it('unsubscribes a YouTube streamer without requiring Twitch platform default', async () => {
      (mockServices.streamAlertService!.list as any) = vi.fn().mockResolvedValue([
        {
          subscription: { id: 'sub_yt_1', guildId: 'guild-1', streamerId: 'youtube_lofigirl' },
          streamer: {
            id: 'youtube_lofigirl',
            platform: 'YOUTUBE',
            platformUserId: 'UC_lofigirl',
            username: 'lofigirl',
            displayName: 'Lofi Girl',
          },
        },
      ]);

      const commands = createStreamCommands(mockServices as BotServices);
      const streamCmd = commands.find((c) => c.metadata.name === 'stream')!;

      const mockCtx: any = {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        member: {
          permissions: {
            has: vi.fn().mockReturnValue(true),
          },
        },
        options: {
          getString: vi.fn().mockImplementation((name) => {
            if (name === 'action') return 'unsubscribe';
            if (name === 'streamer') return 'lofigirl';
            return null;
          }),
          getRawArgs: vi.fn().mockReturnValue([]),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await streamCmd.execute(mockCtx);

      expect(mockServices.streamAlertService?.remove).toHaveBeenCalledWith(
        'guild-1',
        'sub_yt_1',
        expect.anything(),
      );
      expect(mockCtx.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Lofi Girl'),
        }),
      );
    });

    it('executes /stream check manual poll diagnostic cycle', async () => {
      (mockServices.streamWatcher as any).checkStreamsDetailed = vi.fn().mockResolvedValue({
        totalChecked: 3,
        liveCount: 1,
        errors: 0,
        durationMs: 45,
      });
      (mockServices.streamRepo!.listActiveMonitoredStreamers as any) = vi.fn().mockResolvedValue([
        {
          id: 'twitch_shroud',
          platform: 'TWITCH',
          username: 'shroud',
          displayName: 'shroud',
          isLive: true,
        },
      ]);

      const commands = createStreamCommands(mockServices as BotServices);
      const streamCmd = commands.find((c) => c.metadata.name === 'stream')!;

      const mockCtx: any = {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        member: {
          permissions: {
            has: vi.fn().mockReturnValue(true),
          },
        },
        options: {
          getString: vi.fn().mockImplementation((name) => (name === 'action' ? 'check' : null)),
          getRawArgs: vi.fn().mockReturnValue([]),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await streamCmd.execute(mockCtx);

      expect(mockCtx.deferReply).toHaveBeenCalled();
      expect(mockCtx.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });
  });

  describe('Free Games Commands (/freegames, !freegames)', () => {
    it('registers freegames command with aliases', () => {
      const cmd = createFreeGamesCommand(mockServices as BotServices);
      expect(cmd.metadata.name).toBe('freegames');
      expect(cmd.metadata.aliases).toContain('free-games');
    });

    it('displays active free games with embeds and claim buttons', async () => {
      const cmd = createFreeGamesCommand(mockServices as BotServices);

      const mockCtx: any = {
        guildId: 'guild-1',
        options: {
          getString: vi.fn().mockReturnValue(null),
          getRawArgs: vi.fn().mockReturnValue([]),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await cmd.execute(mockCtx);

      expect(mockServices.freeGamesEngine?.pollFreeGames).toHaveBeenCalled();
      expect(mockCtx.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array),
        }),
      );
    });

    it('sets free games announcement channel with ManageGuild check', async () => {
      const cmd = createFreeGamesCommand(mockServices as BotServices);

      const mockCtx: any = {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        member: {
          permissions: {
            has: vi.fn().mockReturnValue(true),
          },
        },
        options: {
          getString: vi.fn().mockReturnValue('setchannel'),
          getChannel: vi.fn().mockResolvedValue({ id: 'channel-free-2' }),
          getRawArgs: vi.fn().mockReturnValue([]),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await cmd.execute(mockCtx);

      expect(mockServices.freeGameRepo?.setGuildChannel).toHaveBeenCalledWith('guild-1', {
        channelId: 'channel-free-2',
      });
      expect(mockCtx.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
        }),
      );
    });

    it('sets the ping role from a prefix role mention (TASK-1662)', async () => {
      const cmd = createFreeGamesCommand(mockServices as BotServices);
      const mockCtx: any = {
        source: 'prefix',
        guildId: 'guild-1',
        guild: { roles: { fetch: vi.fn().mockResolvedValue({ id: '223456789012345678' }) } },
        user: { id: 'user-1' },
        member: { permissions: { has: vi.fn().mockReturnValue(true) } },
        options: {
          getString: vi.fn().mockReturnValue(null),
          getChannel: vi.fn().mockResolvedValue({ id: 'channel-free-2' }),
          getRawArgs: vi
            .fn()
            .mockReturnValue(['setchannel', '<#123456789012345678>', '<@&223456789012345678>']),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn(),
      };

      await cmd.execute(mockCtx);

      expect(mockServices.freeGameRepo?.setGuildChannel).toHaveBeenCalledWith('guild-1', {
        channelId: 'channel-free-2',
        mentionRoleId: '223456789012345678',
      });
    });

    it('refuses a ping role of another server', async () => {
      const cmd = createFreeGamesCommand(mockServices as BotServices);
      const mockCtx: any = {
        source: 'prefix',
        guildId: 'guild-1',
        guild: { roles: { fetch: vi.fn().mockRejectedValue(new Error('Unknown Role')) } },
        user: { id: 'user-1' },
        member: { permissions: { has: vi.fn().mockReturnValue(true) } },
        options: {
          getString: vi.fn().mockReturnValue(null),
          getChannel: vi.fn().mockResolvedValue({ id: 'channel-free-2' }),
          getRawArgs: vi.fn().mockReturnValue(['setchannel', '<@&223456789012345678>']),
        },
        deferReply: vi.fn(),
        editReply: vi.fn(),
        reply: vi.fn(),
      };

      await cmd.execute(mockCtx);

      expect(mockServices.freeGameRepo?.setGuildChannel).not.toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('role of this server') }),
      );
    });

    it('removes free games announcement channel', async () => {
      const cmd = createFreeGamesCommand(mockServices as BotServices);

      const mockCtx: any = {
        guildId: 'guild-1',
        user: { id: 'user-1' },
        member: {
          permissions: {
            has: vi.fn().mockReturnValue(true),
          },
        },
        options: {
          getString: vi.fn().mockReturnValue('remove'),
          getRawArgs: vi.fn().mockReturnValue([]),
        },
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
      };

      await cmd.execute(mockCtx);

      expect(mockServices.freeGameRepo?.removeGuildChannel).toHaveBeenCalledWith('guild-1');
      expect(mockCtx.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Free Games Alerts Disabled'),
        }),
      );
    });
  });
});
