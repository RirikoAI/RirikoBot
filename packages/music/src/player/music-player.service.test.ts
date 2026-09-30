import { describe, it, expect, vi, afterEach } from 'vitest';
import { MusicPlayerService } from './music-player.service.js';
import { LavalinkQueueAdapter } from '../lavalink/lavalink-service.js';
import type { Player } from 'lavalink-client';
import type { QueuedTrack } from '../queue/types.js';
import type { PlayOptions } from './types.js';

describe('MusicPlayerService - Guild Volume Persistence (BUG-0018)', () => {
  it('resolves and caches guild volume from resolver hook', async () => {
    const resolver = vi.fn().mockImplementation(async (guildId: string) => {
      if (guildId === 'guild-custom') return 35;
      return undefined;
    });

    const service = new MusicPlayerService({
      resolveGuildVolume: resolver,
      defaultVolume: 80,
    });

    // 1. Unset guild should resolve default 80
    const defaultVol = await service.resolveVolumeForGuild('guild-default');
    expect(defaultVol).toBe(80);
    expect(service.getGuildCachedVolume('guild-default')).toBe(80);

    // 2. Custom guild should resolve 35
    const customVol = await service.resolveVolumeForGuild('guild-custom');
    expect(customVol).toBe(35);
    expect(service.getGuildCachedVolume('guild-custom')).toBe(35);
    expect(resolver).toHaveBeenCalledWith('guild-custom');

    // 3. Second call should use in-memory cache without re-invoking resolver
    resolver.mockClear();
    const cachedVol = await service.resolveVolumeForGuild('guild-custom');
    expect(cachedVol).toBe(35);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('updates cache and clamp volume on setVolume', () => {
    const service = new MusicPlayerService({
      defaultVolume: 80,
    });

    const clamped1 = service.setVolume('guild-1', 25);
    expect(clamped1).toBe(25);
    expect(service.getGuildCachedVolume('guild-1')).toBe(25);

    // Clamps over 150
    const clamped2 = service.setVolume('guild-1', 200);
    expect(clamped2).toBe(150);
    expect(service.getGuildCachedVolume('guild-1')).toBe(150);

    // Clamps below 0
    const clamped3 = service.setVolume('guild-1', -10);
    expect(clamped3).toBe(0);
    expect(service.getGuildCachedVolume('guild-1')).toBe(0);
  });

  it('creates new queue using the guild cached volume', () => {
    const service = new MusicPlayerService({
      defaultVolume: 80,
    });
    service.setGuildCachedVolume('guild-1', 20);

    const queue = service.getOrCreateQueue('guild-1');
    expect(queue.volume).toBe(20);
  });

  it('restores guild volume across sessions after stop', async () => {
    let savedDbVolume = 80;
    const service = new MusicPlayerService({
      resolveGuildVolume: async () => savedDbVolume,
      defaultVolume: 80,
    });

    // Set volume to 15% and simulate DB persistence
    service.setVolume('guild-session', 15);
    savedDbVolume = 15;

    // Session active: queue has 15%
    const queue1 = service.getOrCreateQueue('guild-session');
    expect(queue1.volume).toBe(15);

    // Stop session (queue is destroyed)
    service.stop('guild-session');
    expect(service.getQueue('guild-session')).toBeUndefined();

    // New session starts: queue initializes with 15%
    const queue2 = service.getOrCreateQueue('guild-session');
    expect(queue2.volume).toBe(15);
  });
});

describe('LavalinkQueueAdapter - setVolume (BUG-0018)', () => {
  it('clamps and delegates setVolume to underlying player', () => {
    const mockPlayer = {
      volume: 80,
      setVolume: vi.fn().mockImplementation((vol: number) => {
        mockPlayer.volume = vol;
      }),
      playing: true,
      paused: false,
      queue: { current: null, tracks: [], previous: [] },
      filterManager: { filters: {} },
    } as unknown as Player;

    const adapter = new LavalinkQueueAdapter(mockPlayer, 'guild-lavalink');

    expect(adapter.volume).toBe(80);

    // Set volume to 20
    const result = adapter.setVolume(20);
    expect(result).toBe(20);
    expect(mockPlayer.setVolume).toHaveBeenCalledWith(20);

    // Clamp over 150
    const over = adapter.setVolume(250);
    expect(over).toBe(150);
    expect(mockPlayer.setVolume).toHaveBeenCalledWith(150);
  });
});

describe('MusicPlayerService - auto-leave and settings changes (TASK-1161)', () => {
  it('stops after the idle timeout when the channel stays empty', () => {
    vi.useFakeTimers();
    try {
      const service = new MusicPlayerService({
        idleTimeoutMs: 1000,
      });
      const stop = vi.spyOn(service, 'stop');

      service.handleChannelOccupancy('g1', 0, true);
      expect(service.hasEmptyChannelTimer('g1')).toBe(true);
      // A second report does not restart the countdown.
      vi.advanceTimersByTime(600);
      service.handleChannelOccupancy('g1', 0, true);
      vi.advanceTimersByTime(400);

      expect(stop).toHaveBeenCalledWith('g1');
      expect(service.hasEmptyChannelTimer('g1')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels when a member joins, and never starts with auto-leave off', () => {
    vi.useFakeTimers();
    try {
      const service = new MusicPlayerService({
        idleTimeoutMs: 1000,
      });
      const stop = vi.spyOn(service, 'stop');

      service.handleChannelOccupancy('g1', 0, true);
      service.handleChannelOccupancy('g1', 1, true);
      service.handleChannelOccupancy('g2', 0, false);
      vi.advanceTimersByTime(5000);

      expect(stop).not.toHaveBeenCalled();
      expect(service.hasEmptyChannelTimer('g1')).toBe(false);
      expect(service.hasEmptyChannelTimer('g2')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads the default volume again after forgetGuildSettings', async () => {
    let saved = 30;
    const service = new MusicPlayerService({
      resolveGuildVolume: () => saved,
    });
    expect(await service.resolveVolumeForGuild('g1')).toBe(30);
    saved = 90;
    expect(await service.resolveVolumeForGuild('g1')).toBe(30);
    service.forgetGuildSettings('g1');
    expect(await service.resolveVolumeForGuild('g1')).toBe(90);
  });
});

const requester = { id: 'user-1', username: 'alice' };

function queuedTrack(id: string, getStream: QueuedTrack['getStream']): QueuedTrack {
  return {
    id,
    title: `Song ${id}`,
    artist: 'Artist',
    durationSeconds: 180,
    url: `https://example.test/${id}`,
    source: 'direct',
    requestedBy: requester,
    addedAt: new Date(),
    getStream,
  };
}

const failingStream = async (): Promise<never> => {
  throw new Error('stream gone');
};
const pendingStream = () => new Promise<never>(() => undefined);

describe('MusicPlayerService - Lavalink backend', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function lavalinkBacked() {
    const service = new MusicPlayerService({
      lavalink: { node: { host: '127.0.0.1', port: 2333 } },
    });
    const lavalink = service.lavalinkService!;
    vi.spyOn(lavalink, 'isReady').mockReturnValue(true);
    return { service, lavalink };
  }

  it('is off unless Lavalink options are given and enabled', () => {
    expect(new MusicPlayerService().lavalinkService).toBeUndefined();
    expect(
      new MusicPlayerService({ lavalink: { enabled: false } }).lavalinkService,
    ).toBeUndefined();
    expect(new MusicPlayerService().isLavalinkActive()).toBe(false);
  });

  it('re-emits every Lavalink player event', () => {
    const { service, lavalink } = lavalinkBacked();
    const events: unknown[][] = [];
    const names = [
      'trackStart',
      'trackEnd',
      'stateChange',
      'queueEnd',
      'volumeChange',
      'loopChange',
      'filterChange',
      'queueShuffled',
    ];
    for (const name of names) {
      service.on(name, (...args: unknown[]) => events.push([name, ...args]));
      lavalink.emit(name, 'guild-1', 'a', 'b');
    }

    expect(events).toEqual([
      ['trackStart', 'guild-1', 'a'],
      ['trackEnd', 'guild-1', 'a', 'b'],
      ['stateChange', 'guild-1', 'a', 'b'],
      ['queueEnd', 'guild-1'],
      ['volumeChange', 'guild-1', 'a', 'b'],
      ['loopChange', 'guild-1', 'a', 'b'],
      ['filterChange', 'guild-1', 'a', 'b'],
      ['queueShuffled', 'guild-1', 'a'],
    ]);
  });

  it('forwards setup calls to the Lavalink service', async () => {
    const { service, lavalink } = lavalinkBacked();
    const init = vi.spyOn(lavalink, 'init').mockResolvedValue();
    const raw = vi.spyOn(lavalink, 'sendRawData').mockImplementation(() => undefined);
    const shard = vi.spyOn(lavalink, 'setSendToShard');
    const send = vi.fn();

    await service.initLavalink({ id: 'bot-1' });
    service.sendRawData({ t: 'VOICE_STATE_UPDATE' });
    service.setSendToShard(send);

    expect(init).toHaveBeenCalledWith({ id: 'bot-1' });
    expect(raw).toHaveBeenCalledWith({ t: 'VOICE_STATE_UPDATE' });
    expect(shard).toHaveBeenCalledWith(send);
  });

  it('plays through Lavalink with the guild volume', async () => {
    const { service, lavalink } = lavalinkBacked();
    const result = { type: 'TRACK' as const, tracksAdded: 1, position: 0 };
    const play = vi.spyOn(lavalink, 'play').mockResolvedValue(result);
    const options = {
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      member: requester,
      query: 'song',
    } as PlayOptions;

    expect(await service.play(options)).toBe(result);
    expect(play).toHaveBeenCalledWith(options, 80);
  });

  it('routes every playback control to Lavalink', async () => {
    const { service, lavalink } = lavalinkBacked();
    const track = queuedTrack('a', failingStream);
    const queue = { state: 'PLAYING', size: 3 };
    vi.spyOn(lavalink, 'getQueue').mockReturnValue(queue as never);
    const calls = {
      pause: vi.spyOn(lavalink, 'pause').mockReturnValue(true),
      resume: vi.spyOn(lavalink, 'resume').mockReturnValue(true),
      skip: vi.spyOn(lavalink, 'skip').mockReturnValue(track),
      previous: vi.spyOn(lavalink, 'previous').mockReturnValue(track),
      stop: vi.spyOn(lavalink, 'stop').mockImplementation(() => undefined),
      setVolume: vi.spyOn(lavalink, 'setVolume').mockReturnValue(true),
      setLoopMode: vi.spyOn(lavalink, 'setLoopMode').mockReturnValue(true),
      shuffle: vi.spyOn(lavalink, 'shuffle').mockReturnValue(true),
      seek: vi.spyOn(lavalink, 'seek').mockReturnValue(true),
      setFilter: vi.spyOn(lavalink, 'setFilter').mockReturnValue(true),
      clearFilters: vi.spyOn(lavalink, 'clearFilters').mockReturnValue(true),
      disconnect: vi.spyOn(lavalink, 'disconnect').mockImplementation(() => undefined),
    };

    expect(service.pause('guild-1')).toBe(true);
    expect(service.resume('guild-1')).toBe(true);
    expect(service.skip('guild-1')).toBe(track);
    expect(service.previous('guild-1')).toBe(track);
    expect(service.setVolume('guild-1', 400)).toBe(150);
    expect(service.getGuildCachedVolume('guild-1')).toBe(150);
    service.setLoopMode('guild-1', 'QUEUE');
    expect(service.shuffle('guild-1')).toBe(3);
    await service.seek('guild-1', 30);
    expect(service.toggleFilter('guild-1', 'nightcore')).toBe(true);
    service.setFilter('guild-1', 'karaoke', true);
    service.setFilter('guild-1', 'karaoke', false);
    service.clearFilters('guild-1');
    expect(service.isPlaying('guild-1')).toBe(true);
    expect(service.isPaused('guild-1')).toBe(false);
    expect(service.getQueue('guild-1')).toBe(queue);
    expect(service.getOrCreateQueue('guild-1', 'text-9')).toBe(queue);
    service.leave('guild-1');
    service.stop('guild-1');

    expect(calls.setVolume).toHaveBeenCalledWith('guild-1', 400);
    expect(calls.setLoopMode).toHaveBeenCalledWith('guild-1', 'QUEUE');
    expect(calls.seek).toHaveBeenCalledWith('guild-1', 30);
    expect(calls.setFilter).toHaveBeenCalledTimes(2);
    expect(calls.clearFilters).toHaveBeenCalledTimes(2);
    expect(calls.disconnect).toHaveBeenCalledWith('guild-1');
    expect(calls.stop).toHaveBeenCalledWith('guild-1');
    for (const spy of [calls.pause, calls.resume, calls.skip, calls.previous, calls.shuffle]) {
      expect(spy).toHaveBeenCalledWith('guild-1');
    }
    expect((queue as { textChannelId?: string }).textChannelId).toBe('text-9');
  });

  it('joins voice by creating and connecting a Lavalink player', async () => {
    const { service, lavalink } = lavalinkBacked();
    const player = { connected: false, connect: vi.fn(async () => undefined) };
    const createPlayer = vi
      .spyOn(lavalink.manager, 'createPlayer')
      .mockReturnValue(player as unknown as Player);

    await service.join('guild-1', 'voice-1', vi.fn() as never);

    expect(createPlayer).toHaveBeenCalledWith({
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      selfDeaf: true,
      volume: 80,
    });
    expect(player.connect).toHaveBeenCalled();
  });
});

describe('MusicPlayerService - built-in player', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports nothing for a guild without a queue', () => {
    const service = new MusicPlayerService();
    expect(service.skip('guild-1')).toBeNull();
    expect(service.previous('guild-1')).toBeNull();
    expect(service.pause('guild-1')).toBe(false);
    expect(service.resume('guild-1')).toBe(false);
    expect(service.isPlaying('guild-1')).toBe(false);
    expect(service.isPaused('guild-1')).toBe(false);
    expect(service.getVoiceManager('guild-1')).toBeUndefined();
  });

  it('re-emits queue events for the guild', () => {
    const service = new MusicPlayerService();
    const events: string[] = [];
    for (const name of [
      'trackAdded',
      'tracksAdded',
      'loopChange',
      'queueShuffled',
      'queueCleared',
      'volumeChange',
      'filterChange',
    ]) {
      service.on(name, (guildId: string) => events.push(`${name}:${guildId}`));
    }

    const queue = service.getOrCreateQueue('guild-1', 'text-1');
    queue.addTrack(queuedTrack('a', pendingStream));
    queue.addTracks([queuedTrack('b', pendingStream), queuedTrack('c', pendingStream)]);
    service.setLoopMode('guild-1', 'QUEUE');
    expect(service.shuffle('guild-1')).toBe(3);
    expect(service.toggleFilter('guild-1', 'nightcore')).toBe(true);
    service.setFilter('guild-1', 'vaporwave', true);
    service.clearFilters('guild-1');
    service.setVolume('guild-1', 40);
    queue.clear();

    expect(events).toEqual(
      expect.arrayContaining([
        'trackAdded:guild-1',
        'tracksAdded:guild-1',
        'loopChange:guild-1',
        'queueShuffled:guild-1',
        'queueCleared:guild-1',
        'volumeChange:guild-1',
        'filterChange:guild-1',
      ]),
    );
    expect(service.getOrCreateQueue('guild-1', 'text-2').textChannelId).toBe('text-2');
  });

  it('skips tracks whose stream fails and reports the errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new MusicPlayerService();
    const errors = vi.fn();
    const queueEnd = vi.fn();
    service.on('error', errors);
    service.on('queueEnd', queueEnd);

    const queue = service.getOrCreateQueue('guild-1');
    queue.addTracks([queuedTrack('a', failingStream), queuedTrack('b', failingStream)]);
    queue.start();

    await vi.waitFor(() => expect(queueEnd).toHaveBeenCalledWith('guild-1'));
    expect(errors).toHaveBeenCalledWith(
      'guild-1',
      expect.objectContaining({ message: 'stream gone' }),
      expect.objectContaining({ id: 'a' }),
    );
    expect(errors).toHaveBeenCalledWith(
      'guild-1',
      expect.anything(),
      expect.objectContaining({ id: 'b' }),
    );
  });

  it('pauses, resumes, skips and goes back through the local queue', () => {
    const service = new MusicPlayerService();
    const queue = service.getOrCreateQueue('guild-1');
    queue.addTracks([queuedTrack('a', pendingStream), queuedTrack('b', pendingStream)]);
    queue.start();
    service.getOrCreateAudioPlayer('guild-1');

    expect(service.isPlaying('guild-1')).toBe(false);
    expect(service.pause('guild-1')).toBe(true);
    expect(service.isPaused('guild-1')).toBe(true);
    expect(service.resume('guild-1')).toBe(true);
    expect(service.skip('guild-1')?.id).toBe('b');
    expect(service.previous('guild-1')?.id).toBe('a');
  });

  it('cleans up the guild when its voice connection ends', () => {
    const service = new MusicPlayerService();
    const voice = service.getOrCreateVoiceManager('guild-1');
    expect(service.getOrCreateVoiceManager('guild-1')).toBe(voice);
    service.getOrCreateAudioPlayer('guild-1');

    voice.emit('disconnected', 'MANUAL');

    expect(service.getVoiceManager('guild-1')).toBeUndefined();
  });

  it('logs error events that have no other listener', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new MusicPlayerService();
    service.emit('error', 'guild-1', new Error('boom'), { title: 'Song' });
    expect(log).toHaveBeenCalledWith(
      '[MusicPlayerService] Error event for guild guild-1:',
      expect.any(Error),
      'Song',
    );
  });
});
