import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseClient, type SqliteDatabaseClient } from '@ririko/database';
import { createBotServices, type BotServices } from '../services.js';
import {
  MusicEmbedController,
  buildControllerButtonRows,
  buildNowPlayingEmbed,
  buildIdleEmbed,
  type MusicEmbedState,
} from './music-embed.controller.js';
import { createSetupMusicCommand } from '../commands/music/commands.js';
import type {
  Client,
  TextChannel,
  Message,
  ButtonInteraction,
  GuildMember,
  ActionRowBuilder,
  ButtonBuilder,
} from 'discord.js';
import {
  VoiceLifecycleManager,
  type MusicSourceAdapter,
  type MusicSearchResult,
  type ResolvedTrack,
  type VoiceConnection,
} from '@ririko/music';
import { Readable } from 'node:stream';

describe('Reactive Embed Controller & Interactive Button Matrix (TASK-0522)', () => {
  let dbClient: SqliteDatabaseClient;
  let services: BotServices;
  let mockClient: Client;
  let mockChannel: TextChannel;
  let mockMessage: Message;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    dbClient = rawClient;

    dbClient.raw.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        profile_background_url TEXT,
        is_blacklisted INTEGER NOT NULL DEFAULT 0,
        warn_count INTEGER NOT NULL DEFAULT 0,
        notify_level_up INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE music_guild_settings (
        guild_id TEXT PRIMARY KEY,
        default_volume INTEGER NOT NULL DEFAULT 80,
        dj_role_id TEXT,
        restrict_voice_channel_id TEXT,
        auto_leave_empty INTEGER NOT NULL DEFAULT 1,
        lyrics_provider TEXT NOT NULL DEFAULT 'GENIUS'
      );

      CREATE TABLE music_channels (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        last_message_id TEXT
      );

      CREATE TABLE music_history (
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        track_title TEXT NOT NULL,
        track_url TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        source_provider TEXT NOT NULL,
        played_at INTEGER NOT NULL
      );

      CREATE TABLE music_saved_playlists (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_public INTEGER NOT NULL DEFAULT 0,
        play_count INTEGER NOT NULL DEFAULT 0,
        guild_id TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE music_playlist_tracks (
        id TEXT PRIMARY KEY,
        playlist_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        duration INTEGER NOT NULL,
        thumbnail_url TEXT,
        position INTEGER NOT NULL
      );
    `);

    services = await createBotServices(dbClient);

    // Mock extractor adapter
    const mockAdapter: MusicSourceAdapter = {
      id: 'youtube',
      name: 'Mock YouTube',
      priority: 1,
      canResolve: () => true,
      search: vi.fn(async (query: string): Promise<MusicSearchResult[]> => [
        {
          id: 'test-1',
          title: `Result for ${query}`,
          artist: 'Test Artist',
          durationSeconds: 180,
          url: 'https://youtube.com/watch?v=test-1',
          source: 'youtube',
        },
      ]),
      resolve: vi.fn(async (input: string): Promise<ResolvedTrack> => ({
        id: 'track-01',
        title: input.toLowerCase().includes('yoasobi') ? 'YOASOBI - Idol' : 'Test Track Title',
        artist: 'YOASOBI',
        durationSeconds: 215,
        url: 'https://youtube.com/watch?v=yoasobi-idol',
        source: 'youtube',
        thumbnailUrl: 'https://img.youtube.com/vi/yoasobi-idol/0.jpg',
        getStream: async () => Readable.from(['pcm-audio']),
      })),
      healthCheck: async () => ({ source: 'youtube', isHealthy: true, latencyMs: 5 }),
    };

    services.musicPlayer.pipeline.registerAdapter(mockAdapter);

    // Mock voice manager join
    vi.spyOn(VoiceLifecycleManager.prototype, 'join').mockImplementation(async function (this: VoiceLifecycleManager) {
      const fakeConnection = {
        state: { status: 'ready' },
        subscribe: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn(),
      } as unknown as VoiceConnection;
      this.setConnection(fakeConnection);
      return fakeConnection;
    });

    const fakeAudioPlayer = {
      play: vi.fn(),
      pause: vi.fn(),
      unpause: vi.fn(),
      stop: vi.fn(),
      on: vi.fn(),
    };
    vi.spyOn(services.musicPlayer as unknown as { getOrCreateAudioPlayer: (guildId: string) => unknown }, 'getOrCreateAudioPlayer').mockImplementation((guildId: string) => {
      (services.musicPlayer as unknown as { audioPlayers: Map<string, unknown> }).audioPlayers.set(guildId, fakeAudioPlayer);
      return fakeAudioPlayer;
    });

    mockMessage = {
      id: 'msg-controller-01',
      edit: vi.fn().mockResolvedValue({} as unknown as Message),
      delete: vi.fn().mockResolvedValue({} as unknown as Message),
    } as unknown as Message;

    mockChannel = {
      id: 'channel-music-01',
      send: vi.fn().mockResolvedValue(mockMessage),
      setTopic: vi.fn().mockResolvedValue({} as unknown as TextChannel),
      messages: {
        fetch: vi.fn().mockResolvedValue(mockMessage),
      },
    } as unknown as TextChannel;

    mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue(mockChannel),
      },
    } as unknown as Client;
  });

  describe('1. Interactive Component Builders (Zero Polling UI)', () => {
    it('builds 2-row button matrix correctly in idle state', () => {
      const idleState: MusicEmbedState = {
        hasCurrentTrack: false,
        hasPrevious: false,
        hasNextTrack: false,
        isPaused: false,
        isMuted: false,
        loopMode: 'OFF',
        queueSize: 0,
      };

      const rows = buildControllerButtonRows(idleState);
      expect(rows.length).toBe(2);

      // Row 1 buttons: previous, play_pause, skip, stop, mute_unmute
      const row1 = rows[0]?.toJSON();
      expect(row1?.components.length).toBe(5);
      expect(row1?.components[0]?.disabled).toBe(true); // previous
      expect(row1?.components[1]?.disabled).toBe(true); // play_pause
      expect(row1?.components[2]?.disabled).toBe(true); // skip
      expect(row1?.components[3]?.disabled).toBe(true); // stop
      expect(row1?.components[4]?.disabled).toBe(true); // mute

      // Row 2 buttons: loop, shuffle, lyrics, queue, refresh
      const row2 = rows[1]?.toJSON();
      expect(row2?.components.length).toBe(5);
      expect(row2?.components[0]?.disabled).toBe(true); // loop
      expect(row2?.components[1]?.disabled).toBe(true); // shuffle (<2 tracks)
      expect(row2?.components[2]?.disabled).toBe(true); // lyrics
      expect(Boolean(row2?.components[3]?.disabled)).toBe(false); // queue always viewable
      expect(Boolean(row2?.components[4]?.disabled)).toBe(false); // refresh always clickable
    });

    it('builds 2-row button matrix with active playing state', () => {
      const activeState: MusicEmbedState = {
        hasCurrentTrack: true,
        hasPrevious: true,
        hasNextTrack: true,
        isPaused: true,
        isMuted: false,
        loopMode: 'TRACK',
        queueSize: 3,
      };

      const rows = buildControllerButtonRows(activeState);
      const row1 = rows[0]?.toJSON();
      const row2 = rows[1]?.toJSON();

      const btnPlayPause = row1?.components[1] as { emoji?: { name?: string } } | undefined;
      const btnLoop = row2?.components[0] as { label?: string } | undefined;
      const btnQueue = row2?.components[3] as { label?: string } | undefined;

      expect(row1?.components[0]?.disabled).toBe(false); // previous enabled
      expect(row1?.components[1]?.disabled).toBe(false); // play_pause enabled
      expect(btnPlayPause?.emoji?.name).toBe('▶️'); // paused => play icon
      expect(row1?.components[2]?.disabled).toBe(false); // skip enabled
      expect(row1?.components[3]?.disabled).toBe(false); // stop enabled

      expect(btnLoop?.label).toContain('Track'); // loop track mode
      expect(row2?.components[1]?.disabled).toBe(false); // shuffle enabled (3 tracks)
      expect(row2?.components[2]?.disabled).toBe(false); // lyrics enabled
      expect(btnQueue?.label).toContain('Queue (3)');
    });

    it('builds rich now-playing embed and idle embed', () => {
      const queue = services.musicPlayer.getOrCreateQueue('guild_01');
      const track = {
        id: 't-1',
        title: 'Racing into the Night',
        artist: 'YOASOBI',
        durationSeconds: 260,
        url: 'https://youtube.com/watch?v=racing',
        source: 'youtube' as const,
        thumbnailUrl: 'https://img.youtube.com/thumb.jpg',
        requestedBy: { id: 'user_01', username: 'Fan' },
        addedAt: new Date(),
        getStream: async () => Readable.from(['pcm']),
      };

      const activeEmbed = buildNowPlayingEmbed(track, queue, 80);
      expect(activeEmbed.data.title).toContain('Racing into the Night');
      expect(activeEmbed.data.url).toBe('https://youtube.com/watch?v=racing');
      expect(activeEmbed.data.fields?.some((f) => f.value.includes('YOASOBI'))).toBe(true);

      const idleEmbed = buildIdleEmbed();
      expect(idleEmbed.data.title).toContain('Ririko Music Controller');
      expect(idleEmbed.data.description).toContain('No music is currently playing');
    });
  });

  describe('2. Dedicated Channel Setup & Controller Updates', () => {
    it('sets up dedicated music channel and stores in database', async () => {
      const controller = new MusicEmbedController(mockClient, services);
      const message = await controller.setupMusicChannel('guild_01', 'channel-music-01');

      expect(message.id).toBe('msg-controller-01');
      expect(mockChannel.send).toHaveBeenCalled();
      expect(mockChannel.setTopic).toHaveBeenCalled();

      // Database record check
      const savedChannel = await services.musicRepo.getMusicChannel('guild_01');
      expect(savedChannel).not.toBeNull();
      expect(savedChannel?.channelId).toBe('channel-music-01');
      expect(savedChannel?.lastMessageId).toBe('msg-controller-01');
    });

    it('executes setup-music command to initialize music controller', async () => {
      const controller = new MusicEmbedController(mockClient, services);
      const setupCmd = createSetupMusicCommand(services, controller);

      const replyFn = vi.fn().mockResolvedValue({});
      const editReplyFn = vi.fn().mockResolvedValue({});
      const deferReplyFn = vi.fn().mockResolvedValue({});

      const ctx = {
        guildId: 'guild_01',
        channel: mockChannel,
        options: {
          getChannel: vi.fn().mockResolvedValue(mockChannel),
        },
        reply: replyFn,
        deferReply: deferReplyFn,
        editReply: editReplyFn,
      };

      await setupCmd.execute(ctx as never);

      expect(deferReplyFn).toHaveBeenCalled();
      expect(editReplyFn).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('successfully deployed') }),
      );
    });

    it('reactively updates controller message on trackStart and queueEnd without polling', async () => {
      const controller = new MusicEmbedController(mockClient, services);
      await controller.setupMusicChannel('guild_01', 'channel-music-01');

      // Start a track via musicPlayer
      await services.musicPlayer.play({
        guildId: 'guild_01',
        voiceChannelId: 'vc-01',
        textChannelId: 'channel-music-01',
        query: 'YOASOBI Idol',
        member: { id: 'u1', username: 'Fan' },
        adapterCreator: (() => ({ sendPayload: () => true, destroy: () => {} })) as never,
      });

      // Allow event dispatch and debounce tick
      await new Promise((r) => setTimeout(r, 70));

      // Controller should update the existing message in-place
      expect(mockMessage.edit).toHaveBeenCalled();
      expect(mockChannel.setTopic).toHaveBeenCalledWith(expect.stringContaining('YOASOBI - Idol'));

      // Skip track to end queue
      services.musicPlayer.skip('guild_01');
      await new Promise((r) => setTimeout(r, 70));

      // On queue end, controller should update to idle
      expect(mockMessage.edit).toHaveBeenCalled();
    });

    it('reactively updates controller and enables Next button when a track is added to active playback', async () => {
      const controller = new MusicEmbedController(mockClient, services);
      await controller.setupMusicChannel('guild_01', 'channel-music-01');

      // Start first track
      await services.musicPlayer.play({
        guildId: 'guild_01',
        voiceChannelId: 'vc-01',
        textChannelId: 'channel-music-01',
        query: 'YOASOBI Idol',
        member: { id: 'u1', username: 'Fan' },
        adapterCreator: (() => ({ sendPayload: () => true, destroy: () => {} })) as never,
      });
      await new Promise((r) => setTimeout(r, 70));

      expect(mockMessage.edit).toHaveBeenCalled();
      const lastCallFirstTrack = vi.mocked(mockMessage.edit).mock.calls.at(-1)?.[0] as {
        components?: ActionRowBuilder<ButtonBuilder>[];
      };
      const row1First = lastCallFirstTrack?.components?.[0]?.toJSON();
      const row2First = lastCallFirstTrack?.components?.[1]?.toJSON();
      const skipBtnFirst = row1First?.components?.[2] as { disabled?: boolean } | undefined;
      const queueBtnFirst = row2First?.components?.[3] as { label?: string } | undefined;
      expect(skipBtnFirst?.disabled).toBe(true); // No next track yet
      expect(queueBtnFirst?.label).toBe('Queue (1)'); // Signifies 1 music currently playing and not (0)

      // Add second track to active playback
      await services.musicPlayer.play({
        guildId: 'guild_01',
        voiceChannelId: 'vc-01',
        textChannelId: 'channel-music-01',
        query: 'YOASOBI Monster',
        member: { id: 'u1', username: 'Fan' },
        adapterCreator: (() => ({ sendPayload: () => true, destroy: () => {} })) as never,
      });
      await new Promise((r) => setTimeout(r, 70));

      const lastCallSecondTrack = vi.mocked(mockMessage.edit).mock.calls.at(-1)?.[0] as {
        components?: ActionRowBuilder<ButtonBuilder>[];
      };
      const row1Second = lastCallSecondTrack?.components?.[0]?.toJSON();
      const row2Second = lastCallSecondTrack?.components?.[1]?.toJSON();
      const skipBtnSecond = row1Second?.components?.[2] as { disabled?: boolean } | undefined;
      const queueBtnSecond = row2Second?.components?.[3] as { label?: string } | undefined;
      expect(Boolean(skipBtnSecond?.disabled)).toBe(false); // Next button now enabled!
      expect(queueBtnSecond?.label).toBe('Queue (2)'); // Shows 2 tracks
    });
  });

  describe('3. Button Interaction Routing (handleButtonInteraction)', () => {
    let controller: MusicEmbedController;

    beforeEach(async () => {
      controller = new MusicEmbedController(mockClient, services);
      await controller.setupMusicChannel('guild_01', 'channel-music-01');

      await services.musicPlayer.play({
        guildId: 'guild_01',
        voiceChannelId: 'vc-01',
        textChannelId: 'channel-music-01',
        query: 'YOASOBI Idol',
        member: { id: 'u1', username: 'Fan' },
        adapterCreator: (() => ({ sendPayload: () => true, destroy: () => {} })) as never,
      });
    });

    function createMockButtonInteraction(customId: string, voiceChannelId: string | null = 'vc-01'): ButtonInteraction {
      const member = {
        id: 'u1',
        voice: {
          channelId: voiceChannelId,
        },
      } as unknown as GuildMember;

      return {
        customId,
        guildId: 'guild_01',
        member,
        reply: vi.fn().mockResolvedValue({}),
        deferUpdate: vi.fn().mockResolvedValue({}),
        deferReply: vi.fn().mockResolvedValue({}),
        editReply: vi.fn().mockResolvedValue({}),
      } as unknown as ButtonInteraction;
    }

    it('rejects button interaction if user is not in a voice channel', async () => {
      const interaction = createMockButtonInteraction('music_play_pause', null);
      await controller.handleButtonInteraction(interaction);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('join a voice channel') }),
      );
    });

    it('toggles pause and resume via music_play_pause button', async () => {
      const interaction = createMockButtonInteraction('music_play_pause');

      // 1. Pause
      await controller.handleButtonInteraction(interaction);
      expect(interaction.deferUpdate).toHaveBeenCalled();
      expect(services.musicPlayer.isPaused('guild_01')).toBe(true);

      // 2. Resume
      await controller.handleButtonInteraction(interaction);
      expect(services.musicPlayer.isPlaying('guild_01')).toBe(true);
    });

    it('cycles loop modes via music_loop button', async () => {
      const interaction = createMockButtonInteraction('music_loop');
      const queue = services.musicPlayer.getOrCreateQueue('guild_01');

      expect(queue.loopMode).toBe('OFF');

      await controller.handleButtonInteraction(interaction);
      expect(queue.loopMode).toBe('TRACK');

      await controller.handleButtonInteraction(interaction);
      expect(queue.loopMode).toBe('QUEUE');

      await controller.handleButtonInteraction(interaction);
      expect(queue.loopMode).toBe('OFF');
    });

    it('mutes and restores volume via music_mute_unmute button', async () => {
      const interaction = createMockButtonInteraction('music_mute_unmute');
      const queue = services.musicPlayer.getOrCreateQueue('guild_01');

      expect(queue.volume).toBe(80);

      // Mute to 0
      await controller.handleButtonInteraction(interaction);
      expect(queue.volume).toBe(0);

      // Unmute back to 80
      await controller.handleButtonInteraction(interaction);
      expect(queue.volume).toBe(80);
    });

    it('handles stop, lyrics, queue, and refresh buttons', async () => {
      // Lyrics
      const lyricsInteraction = createMockButtonInteraction('music_lyrics');
      await controller.handleButtonInteraction(lyricsInteraction);
      expect(lyricsInteraction.deferReply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
      expect(lyricsInteraction.editReply).toHaveBeenCalled();

      // Queue (ephemeral response showing now playing track even when upcoming is 0)
      const queueInteraction = createMockButtonInteraction('music_queue');
      await controller.handleButtonInteraction(queueInteraction);
      expect(queueInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: expect.stringContaining('Current Queue (1 track)'),
                description: expect.stringContaining('YOASOBI - Idol'),
              }),
            }),
          ]),
          ephemeral: true,
        }),
      );

      // Refresh
      const refreshInteraction = createMockButtonInteraction('music_refresh');
      await controller.handleButtonInteraction(refreshInteraction);
      expect(refreshInteraction.deferUpdate).toHaveBeenCalled();

      // Stop
      const stopInteraction = createMockButtonInteraction('music_stop');
      await controller.handleButtonInteraction(stopInteraction);
      expect(stopInteraction.deferUpdate).toHaveBeenCalled();
      expect(services.musicPlayer.getQueue('guild_01')).toBeUndefined();
    });
  });

  describe('4. Dedicated Music Channel Auto-Play Message Listener', () => {
    it('deletes message and starts playback if user is in voice channel', async () => {
      const controller = new MusicEmbedController(mockClient, services);
      await controller.setupMusicChannel('guild_01', 'channel-music-01');

      const deleteFn = vi.fn().mockResolvedValue({});
      const mockMsg = {
        id: 'user-msg-01',
        content: 'YOASOBI Idol',
        channelId: 'channel-music-01',
        guild: {
          id: 'guild_01',
          voiceAdapterCreator: (() => ({ sendPayload: () => true, destroy: () => {} })) as never,
        },
        member: {
          id: 'u1',
          voice: { channelId: 'vc-01' },
          displayName: 'Listener',
        },
        author: {
          id: 'u1',
          username: 'Listener',
          bot: false,
          displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png',
        },
        delete: deleteFn,
        channel: mockChannel,
      } as unknown as Message;

      const handled = await controller.handleMusicChannelMessage(mockMsg);
      expect(handled).toBe(true);
      expect(deleteFn).toHaveBeenCalled();
      expect(services.musicPlayer.getQueue('guild_01')?.currentTrack?.title).toBe('YOASOBI - Idol');
    });

    it('warns user if message is sent in music channel while not in voice channel', async () => {
      const controller = new MusicEmbedController(mockClient, services);
      await controller.setupMusicChannel('guild_01', 'channel-music-01');

      const sendFn = vi.fn().mockResolvedValue({
        delete: vi.fn().mockResolvedValue({}),
      });

      const mockMsg = {
        id: 'user-msg-02',
        content: 'Another Song',
        channelId: 'channel-music-01',
        guild: { id: 'guild_01' },
        member: {
          id: 'u2',
          voice: { channelId: null }, // not in voice!
        },
        author: {
          id: 'u2',
          username: 'Listener2',
          bot: false,
        },
        delete: vi.fn().mockResolvedValue({}),
        channel: { send: sendFn },
      } as unknown as Message;

      const handled = await controller.handleMusicChannelMessage(mockMsg);
      expect(handled).toBe(true);
      expect(sendFn).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('please join a voice channel') }),
      );
    });

    it('ignores messages from other channels', async () => {
      const controller = new MusicEmbedController(mockClient, services);
      await controller.setupMusicChannel('guild_01', 'channel-music-01');

      const mockMsg = {
        channelId: 'general-chat-channel',
        guild: { id: 'guild_01' },
        author: { bot: false },
      } as unknown as Message;

      const handled = await controller.handleMusicChannelMessage(mockMsg);
      expect(handled).toBe(false);
    });
  });
});
