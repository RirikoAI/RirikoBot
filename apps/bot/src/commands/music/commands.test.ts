import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseClient, type SqliteDatabaseClient } from '@ririko/database';
import { CommandCategory, type CommandContext } from '@ririko/discord';
import type { User, Guild, TextBasedChannel, Client, Message, GuildMember } from 'discord.js';
import { createBotServices, type BotServices } from '../../services.js';
import {
  createMusicCommands,
  formatDuration,
  parseDuration,
  createProgressBar,
} from './commands.js';
import { Readable } from 'node:stream';
import {
  VoiceLifecycleManager,
  type MusicSourceAdapter,
  type MusicSearchResult,
  type ResolvedTrack,
  type VoiceConnection,
} from '@ririko/music';

function createMockContext(params: {
  userId?: string;
  username?: string;
  guildId?: string;
  voiceChannelId?: string | null;
  optionsMap?: Record<string, unknown>;
  replyFn?: (res: unknown) => Promise<unknown>;
  rawArgs?: string[];
}): CommandContext {
  const user = {
    id: params.userId ?? 'user_listener_01',
    username: params.username ?? 'MelodyFan',
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/user/avatar.png',
  } as unknown as User;

  const voiceChannelId = params.voiceChannelId === undefined ? 'vc-music-1' : params.voiceChannelId;

  const member = {
    id: user.id,
    user,
    voice: {
      channelId: voiceChannelId,
    },
  } as unknown as GuildMember;

  const guild =
    params.guildId !== null
      ? ({
          id: params.guildId ?? 'guild_music_01',
          name: 'Harmonic Guild',
          voiceAdapterCreator: (() => ({
            sendPayload: () => true,
            destroy: () => {},
          })) as never,
        } as unknown as Guild)
      : null;

  const optionsMap = params.optionsMap ?? {};
  const reply = (params.replyFn ??
    vi.fn().mockResolvedValue({})) as unknown as CommandContext['reply'];

  return {
    source: 'slash',
    id: 'ctx-music-mock',
    client: {} as Client,
    guild,
    guildId: guild?.id ?? null,
    channel: {
      id: 'channel-text-1',
      send: vi.fn().mockResolvedValue({} as unknown as Message),
    } as unknown as TextBasedChannel,
    channelId: 'channel-text-1',
    member,
    user,
    commandName: 'music',
    invokedName: 'music',
    invokedPrefix: '/',
    isReplied: false,
    isDeferred: false,
    raw: {} as unknown as Message,
    options: {
      getString: (name: string) => (optionsMap[name] as string | undefined) ?? null,
      getInteger: (name: string) => (optionsMap[name] as number | undefined) ?? null,
      getNumber: (name: string) => (optionsMap[name] as number | undefined) ?? null,
      getBoolean: (name: string) => (optionsMap[name] as boolean | undefined) ?? null,
      getUser: async (name: string) => (optionsMap[name] as User | undefined) ?? null,
      getMember: async () => member,
      getChannel: async () => null,
      getAttachment: () => null,
      getRawArgs: () => params.rawArgs ?? [],
    },
    reply,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue({} as unknown as Message),
    followUp: vi.fn().mockResolvedValue({} as unknown as Message),
    send: vi.fn().mockResolvedValue({} as unknown as Message),
  };
}

describe('Dual-Dispatch Music Commands Suite (TASK-0521)', () => {
  let dbClient: SqliteDatabaseClient;
  let services: BotServices;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    dbClient = rawClient;

    // Execute schema for tests
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

    // Mock an extractor adapter so search/resolve returns instantly
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
          durationSeconds: 200,
          url: 'https://youtube.com/watch?v=test-1',
          source: 'youtube',
        },
      ]),
      resolve: vi.fn(async (input: string): Promise<ResolvedTrack> => ({
        id: 'track-101',
        title: input.includes('yoasobi') ? 'YOASOBI - Idol' : 'Test Track Title',
        artist: 'YOASOBI',
        durationSeconds: 215,
        url: 'https://youtube.com/watch?v=yoasobi-idol',
        source: 'youtube',
        thumbnailUrl: 'https://img.youtube.com/vi/yoasobi-idol/0.jpg',
        getStream: async () => Readable.from(['audio-pcm-data']),
      })),
      healthCheck: async () => ({ source: 'youtube', isHealthy: true, latencyMs: 5 }),
    };

    services.musicPlayer.pipeline.registerAdapter(mockAdapter);

    // Mock voice manager join and audio playback to avoid connecting to real discord gateway in unit tests
    vi.spyOn(VoiceLifecycleManager.prototype, 'join').mockImplementation(async function (
      this: VoiceLifecycleManager,
    ) {
      const fakeConnection = {
        state: { status: 'ready' },
        subscribe: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn(),
      } as unknown as VoiceConnection;
      this.setConnection(fakeConnection);
      return fakeConnection;
    });

    vi.spyOn(services.musicPlayer, 'join').mockResolvedValue({
      subscribe: vi.fn(),
      state: { status: 'ready' },
      destroy: vi.fn(),
    } as never);

    const fakeAudioPlayer = {
      play: vi.fn(),
      pause: vi.fn(),
      unpause: vi.fn(),
      stop: vi.fn(),
      on: vi.fn(),
    };
    vi.spyOn(
      services.musicPlayer as unknown as { getOrCreateAudioPlayer: (guildId: string) => unknown },
      'getOrCreateAudioPlayer',
    ).mockImplementation((guildId: string) => {
      (services.musicPlayer as unknown as { audioPlayers: Map<string, unknown> }).audioPlayers.set(
        guildId,
        fakeAudioPlayer,
      );
      return fakeAudioPlayer;
    });
  });

  describe('1. Command Suite Catalog & Parity', () => {
    it('creates all 17 dual-dispatch music commands with MUSIC category', () => {
      const commands = createMusicCommands(services);
      expect(commands.length).toBe(17);

      const commandNames = commands.map((c) => c.metadata.name);
      expect(commandNames).toContain('play');
      expect(commandNames).toContain('pause');
      expect(commandNames).toContain('resume');
      expect(commandNames).toContain('skip');
      expect(commandNames).toContain('back');
      expect(commandNames).toContain('stop');
      expect(commandNames).toContain('queue');
      expect(commandNames).toContain('nowplaying');
      expect(commandNames).toContain('volume');
      expect(commandNames).toContain('loop');
      expect(commandNames).toContain('shuffle');
      expect(commandNames).toContain('seek');
      expect(commandNames).toContain('filter');
      expect(commandNames).toContain('lyrics');
      expect(commandNames).toContain('join');
      expect(commandNames).toContain('leave');
      expect(commandNames).toContain('playlist');

      for (const cmd of commands) {
        expect(cmd.metadata.category).toBe(CommandCategory.MUSIC);
        expect(cmd.metadata.isGuildOnly).toBe(true);
        expect(cmd.metadata.description).toBeDefined();
      }
    });

    it('verifies duration, timestamp parsing, and progress bar helpers', () => {
      expect(formatDuration(0)).toBe('0:00');
      expect(formatDuration(45)).toBe('0:45');
      expect(formatDuration(125)).toBe('2:05');
      expect(formatDuration(3665)).toBe('1:01:05');

      expect(parseDuration('90')).toBe(90);
      expect(parseDuration('1:30')).toBe(90);
      expect(parseDuration('01:30')).toBe(90);
      expect(parseDuration('1:01:05')).toBe(3665);
      expect(parseDuration('invalid')).toBeNull();

      const bar = createProgressBar(50, 100, 10);
      expect(bar).toContain('🔘');
      expect(bar).toContain('▬');
    });
  });

  describe('2. /play Command', () => {
    it('rejects execution if user is not in a voice channel', async () => {
      const commands = createMusicCommands(services);
      const playCmd = commands.find((c) => c.metadata.name === 'play')!;

      const replyFn = vi.fn();
      const ctx = createMockContext({
        voiceChannelId: null, // Not connected
        optionsMap: { query: 'YOASOBI Idol' },
        replyFn,
      });

      await playCmd.execute(ctx);
      expect(replyFn).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('connected to a voice channel'),
        }),
      );
    });

    it('plays query, adds track to queue, and records history', async () => {
      const commands = createMusicCommands(services);
      const playCmd = commands.find((c) => c.metadata.name === 'play')!;

      const ctx = createMockContext({
        optionsMap: { query: 'yoasobi idol' },
      });

      await playCmd.execute(ctx);

      expect(ctx.deferReply).toHaveBeenCalled();
      expect(ctx.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );

      // Verify queue has track
      const queue = services.musicPlayer.getQueue('guild_music_01');
      expect(queue).toBeDefined();
      expect(queue?.currentTrack?.title).toBe('YOASOBI - Idol');

      // Verify history recorded in database
      const history = await services.musicRepo.getGuildHistory('guild_music_01');
      expect(history.length).toBe(1);
      expect(history[0]?.trackTitle).toBe('YOASOBI - Idol');
    });
  });

  describe('3. /pause, /resume, /skip, /back & /stop Commands', () => {
    it('pauses and resumes playback', async () => {
      const commands = createMusicCommands(services);
      const playCmd = commands.find((c) => c.metadata.name === 'play')!;
      const pauseCmd = commands.find((c) => c.metadata.name === 'pause')!;
      const resumeCmd = commands.find((c) => c.metadata.name === 'resume')!;

      // 1. Start track
      await playCmd.execute(createMockContext({ optionsMap: { query: 'song' } }));

      // 2. Pause
      const pauseCtx = createMockContext({ replyFn: vi.fn() });
      await pauseCmd.execute(pauseCtx);
      expect(pauseCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('paused') }),
      );

      // 3. Resume
      const resumeCtx = createMockContext({ replyFn: vi.fn() });
      await resumeCmd.execute(resumeCtx);
      expect(resumeCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('resumed') }),
      );
    });

    it('skips track and supports /back from history', async () => {
      const commands = createMusicCommands(services);
      const playCmd = commands.find((c) => c.metadata.name === 'play')!;
      const skipCmd = commands.find((c) => c.metadata.name === 'skip')!;
      const backCmd = commands.find((c) => c.metadata.name === 'back')!;

      // Play track 1 and track 2
      await playCmd.execute(createMockContext({ optionsMap: { query: 'song 1' } }));
      await playCmd.execute(createMockContext({ optionsMap: { query: 'song 2' } }));

      // Skip track 1
      const skipCtx = createMockContext({ replyFn: vi.fn() });
      await skipCmd.execute(skipCtx);
      expect(skipCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Skipped') }),
      );

      // Back to track 1
      const backCtx = createMockContext({ replyFn: vi.fn() });
      await backCmd.execute(backCtx);
      expect(backCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('previous track') }),
      );
    });

    it('stops playback, clears queue, and leaves voice channel', async () => {
      const commands = createMusicCommands(services);
      const playCmd = commands.find((c) => c.metadata.name === 'play')!;
      const stopCmd = commands.find((c) => c.metadata.name === 'stop')!;

      await playCmd.execute(createMockContext({ optionsMap: { query: 'song' } }));

      const stopCtx = createMockContext({ replyFn: vi.fn() });
      await stopCmd.execute(stopCtx);
      expect(stopCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Stopped playback') }),
      );

      const queue = services.musicPlayer.getQueue('guild_music_01');
      expect(queue).toBeUndefined();
    });
  });

  describe('4. /queue, /nowplaying, /volume, /loop & /shuffle Commands', () => {
    it('displays queue and now playing embeds', async () => {
      const commands = createMusicCommands(services);
      const playCmd = commands.find((c) => c.metadata.name === 'play')!;
      const queueCmd = commands.find((c) => c.metadata.name === 'queue')!;
      const npCmd = commands.find((c) => c.metadata.name === 'nowplaying')!;

      await playCmd.execute(createMockContext({ optionsMap: { query: 'song' } }));

      const queueCtx = createMockContext({ replyFn: vi.fn() });
      await queueCmd.execute(queueCtx);
      expect(queueCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );

      const npCtx = createMockContext({ replyFn: vi.fn() });
      await npCmd.execute(npCtx);
      expect(npCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });

    it('adjusts volume with safety clamping and updates guild settings', async () => {
      const commands = createMusicCommands(services);
      const volCmd = commands.find((c) => c.metadata.name === 'volume')!;

      // Inspect volume
      const getVolCtx = createMockContext({ optionsMap: {}, replyFn: vi.fn() });
      await volCmd.execute(getVolCtx);
      expect(getVolCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Current playback volume is') }),
      );

      // Set volume to 120
      const setVolCtx = createMockContext({ optionsMap: { level: 120 }, replyFn: vi.fn() });
      await volCmd.execute(setVolCtx);
      expect(setVolCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('120%') }),
      );

      const queue = services.musicPlayer.getQueue('guild_music_01');
      expect(queue?.volume).toBe(120);
    });

    it('restores guild default volume on a brand new playback session after stop (BUG-0018)', async () => {
      const commands = createMusicCommands(services);
      const playCmd = commands.find((c) => c.metadata.name === 'play')!;
      const volCmd = commands.find((c) => c.metadata.name === 'volume')!;
      const stopCmd = commands.find((c) => c.metadata.name === 'stop')!;

      // 1. Play first track
      await playCmd.execute(createMockContext({ optionsMap: { query: 'first song' } }));

      // 2. Set volume to 25% (should persist into music_guild_settings)
      const setVolCtx = createMockContext({ optionsMap: { level: 25 }, replyFn: vi.fn() });
      await volCmd.execute(setVolCtx);
      expect(services.musicPlayer.getQueue('guild_music_01')?.volume).toBe(25);

      // Verify persisted in DB
      const dbSettings = await services.musicRepo.getGuildSettings('guild_music_01');
      expect(dbSettings?.defaultVolume).toBe(25);

      // 3. Stop session (cleans up and deletes queue)
      const stopCtx = createMockContext({ replyFn: vi.fn() });
      await stopCmd.execute(stopCtx);
      expect(services.musicPlayer.getQueue('guild_music_01')).toBeUndefined();

      // 4. Start a brand new session with another track
      await playCmd.execute(createMockContext({ optionsMap: { query: 'second song' } }));

      // 5. Verify the new queue was created with the saved volume (25%), NOT default 80%
      const newQueue = services.musicPlayer.getQueue('guild_music_01');
      expect(newQueue).toBeDefined();
      expect(newQueue?.volume).toBe(25);
    });

    it('cycles and sets loop modes', async () => {
      const commands = createMusicCommands(services);
      const loopCmd = commands.find((c) => c.metadata.name === 'loop')!;

      // Explicitly set TRACK
      const trackCtx = createMockContext({ optionsMap: { mode: 'track' }, replyFn: vi.fn() });
      await loopCmd.execute(trackCtx);
      expect(trackCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('TRACK') }),
      );

      // Toggle loop mode (cycles from TRACK -> QUEUE)
      const cycleCtx = createMockContext({ optionsMap: {}, replyFn: vi.fn() });
      await loopCmd.execute(cycleCtx);
      expect(cycleCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('QUEUE') }),
      );
    });

    it('shuffles upcoming tracks', async () => {
      const commands = createMusicCommands(services);
      const playCmd = commands.find((c) => c.metadata.name === 'play')!;
      const shuffleCmd = commands.find((c) => c.metadata.name === 'shuffle')!;

      await playCmd.execute(createMockContext({ optionsMap: { query: 'song 1' } }));
      await playCmd.execute(createMockContext({ optionsMap: { query: 'song 2' } }));
      await playCmd.execute(createMockContext({ optionsMap: { query: 'song 3' } }));

      const shuffleCtx = createMockContext({ replyFn: vi.fn() });
      await shuffleCmd.execute(shuffleCtx);
      expect(shuffleCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Shuffled') }),
      );
    });
  });

  describe('5. /seek, /filter, /lyrics, /join & /leave Commands', () => {
    it('seeks to valid timestamp', async () => {
      const commands = createMusicCommands(services);
      const playCmd = commands.find((c) => c.metadata.name === 'play')!;
      const seekCmd = commands.find((c) => c.metadata.name === 'seek')!;

      await playCmd.execute(createMockContext({ optionsMap: { query: 'song' } }));

      const seekCtx = createMockContext({ optionsMap: { timestamp: '1:30' }, replyFn: vi.fn() });
      await seekCmd.execute(seekCtx);
      expect(seekCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('1:30') }),
      );

      const queue = services.musicPlayer.getQueue('guild_music_01');
      expect(queue?.playbackPositionSeconds).toBe(90);
    });

    it('toggles audio filters and clears on normal', async () => {
      const commands = createMusicCommands(services);
      const filterCmd = commands.find((c) => c.metadata.name === 'filter')!;

      // Toggle bassboost ON
      const bbCtx = createMockContext({ optionsMap: { preset: 'bassboost' }, replyFn: vi.fn() });
      await filterCmd.execute(bbCtx);
      expect(bbCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('bassboost') }),
      );

      const queue = services.musicPlayer.getQueue('guild_music_01');
      expect(queue?.activeFilters).toContain('bassboost');

      // Clear on normal
      const clearCtx = createMockContext({ optionsMap: { preset: 'normal' }, replyFn: vi.fn() });
      await filterCmd.execute(clearCtx);
      expect(clearCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Cleared all audio filters') }),
      );
      expect(queue?.activeFilters).toEqual([]);
    });

    it('joins and leaves voice channel', async () => {
      const commands = createMusicCommands(services);
      const joinCmd = commands.find((c) => c.metadata.name === 'join')!;
      const leaveCmd = commands.find((c) => c.metadata.name === 'leave')!;

      const joinCtx = createMockContext({ replyFn: vi.fn() });
      await joinCmd.execute(joinCtx);
      expect(joinCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Connected to voice channel') }),
      );

      const leaveCtx = createMockContext({ replyFn: vi.fn() });
      await leaveCmd.execute(leaveCtx);
      expect(leaveCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Disconnected from voice channel'),
        }),
      );
    });
  });

  describe('6. /playlist Command (CRUD & Playback)', () => {
    it('creates, lists, adds track, plays, and deletes custom playlist', async () => {
      const commands = createMusicCommands(services);
      const plCmd = commands.find((c) => c.metadata.name === 'playlist')!;

      // 1. Create playlist
      const createCtx = createMockContext({
        optionsMap: { action: 'create', name: 'Chill Vibes' },
        replyFn: vi.fn(),
      });
      await plCmd.execute(createCtx);
      expect(createCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Created playlist') }),
      );

      // 2. List playlists
      const listCtx = createMockContext({
        optionsMap: { action: 'list' },
        replyFn: vi.fn(),
      });
      await plCmd.execute(listCtx);
      expect(listCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ embeds: expect.any(Array) }),
      );

      // 3. Add track to playlist
      const addCtx = createMockContext({
        optionsMap: { action: 'add', name: 'Chill Vibes', query: 'yoasobi idol' },
        replyFn: vi.fn(),
      });
      await plCmd.execute(addCtx);
      expect(addCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Added') }),
      );

      // 4. Play playlist
      const playPlCtx = createMockContext({
        optionsMap: { action: 'play', name: 'Chill Vibes' },
      });
      await plCmd.execute(playPlCtx);
      expect(playPlCtx.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Loaded **1** tracks') }),
      );

      // 5. Delete playlist
      const deleteCtx = createMockContext({
        optionsMap: { action: 'delete', name: 'Chill Vibes' },
        replyFn: vi.fn(),
      });
      await plCmd.execute(deleteCtx);
      expect(deleteCtx.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Deleted playlist') }),
      );
    });
  });
});
