import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player } from 'lavalink-client';
import {
  LavalinkQueueAdapter,
  LavalinkService,
  lavalinkTrackToQueuedTrack,
} from './lavalink-service.js';
import type { PlayOptions } from '../player/types.js';

// The LavalinkManager is real but never initialized, so it opens no connection. Players are
// in-memory fakes with the parts of the lavalink-client Player API the service uses.

const alice = { id: 'user-1', username: 'alice' };

function lavalinkTrack(id: string, durationMs = 200_000) {
  return {
    info: {
      identifier: id,
      title: `Song ${id}`,
      author: 'Artist',
      duration: durationMs,
      uri: `https://www.youtube.com/watch?v=${id}`,
      sourceName: 'youtube',
    },
    pluginInfo: {},
    requester: alice,
  };
}

type FakeTrack = ReturnType<typeof lavalinkTrack>;

function createFakePlayer(guildId = 'guild-1') {
  const queue = {
    current: null as FakeTrack | null,
    tracks: [] as FakeTrack[],
    previous: [] as FakeTrack[],
    add: vi.fn((added: FakeTrack | FakeTrack[]) => {
      queue.tracks.push(...[added].flat());
    }),
    shuffle: vi.fn(() => {
      queue.tracks.reverse();
    }),
  };
  const player = {
    guildId,
    textChannelId: 'text-1',
    playing: false,
    paused: false,
    connected: false,
    volume: 80,
    repeatMode: 'off' as 'off' | 'track' | 'queue',
    position: 0,
    queue,
    filterManager: {
      filters: {} as Record<string, boolean>,
      equalizerBands: [] as unknown[],
      setEQ: vi.fn(),
      toggleNightcore: vi.fn(),
      toggleVaporwave: vi.fn(),
      toggleRotation: vi.fn(),
      toggleKaraoke: vi.fn(),
      resetFilters: vi.fn(),
    },
    node: { search: vi.fn() },
    connect: vi.fn(async () => {
      player.connected = true;
    }),
    play: vi.fn(async () => {
      player.playing = true;
    }),
    pause: vi.fn(async () => {
      player.paused = true;
    }),
    resume: vi.fn(async () => {
      player.paused = false;
    }),
    skip: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    seek: vi.fn(async () => undefined),
    setVolume: vi.fn(async (volume: number) => {
      player.volume = volume;
    }),
    setRepeatMode: vi.fn((mode: 'off' | 'track' | 'queue') => {
      player.repeatMode = mode;
    }),
  };
  return player;
}

type FakePlayer = ReturnType<typeof createFakePlayer>;
const asPlayer = (player: FakePlayer) => player as unknown as Player;

describe('lavalinkTrackToQueuedTrack', () => {
  it('maps Lavalink track info and plugin metadata', () => {
    const raw = {
      ...lavalinkTrack('abc123', 215_400),
      info: { ...lavalinkTrack('abc123').info, duration: 215_400, isrc: 'JPU902300001' },
      pluginInfo: { albumName: 'The Book 3' },
    };
    const queued = lavalinkTrackToQueuedTrack(raw, alice) as unknown as Record<string, unknown>;

    expect(queued).toMatchObject({
      id: 'abc123',
      title: 'Song abc123',
      artist: 'Artist',
      durationSeconds: 215,
      source: 'youtube',
      requestedBy: { id: 'user-1', username: 'alice' },
      isrc: 'JPU902300001',
      album: 'The Book 3',
      rawTrack: raw,
    });
  });

  it('falls back to defaults for a track without info', async () => {
    const queued = lavalinkTrackToQueuedTrack({});
    expect(queued).toMatchObject({
      id: 'unknown_id',
      title: 'Unknown Title',
      artist: 'Unknown Artist',
      durationSeconds: 0,
      source: 'lavalink',
      requestedBy: { id: 'unknown', username: 'User' },
    });
    await expect(queued.getStream()).rejects.toThrow('Streaming handled by Lavalink');
  });
});

describe('LavalinkQueueAdapter', () => {
  let player: FakePlayer;
  let adapter: LavalinkQueueAdapter;

  beforeEach(() => {
    player = createFakePlayer();
    adapter = new LavalinkQueueAdapter(asPlayer(player), 'guild-1', 'text-1');
  });

  it('reports state, loop mode and volume from the player', () => {
    expect(adapter.guildId).toBe('guild-1');
    expect(adapter.state).toBe('IDLE');
    player.paused = true;
    expect(adapter.state).toBe('PAUSED');
    player.playing = true;
    expect(adapter.state).toBe('PLAYING');

    expect(adapter.loopMode).toBe('OFF');
    player.repeatMode = 'track';
    expect(adapter.loopMode).toBe('TRACK');
    player.repeatMode = 'queue';
    expect(adapter.loopMode).toBe('QUEUE');

    expect(adapter.volume).toBe(80);
    expect(adapter.gain).toBe(0.8);
    expect(adapter.setVolume(500)).toBe(150);
    expect(player.setVolume).toHaveBeenCalledWith(150);
    expect(adapter.setVolume(-3)).toBe(0);
    expect(adapter.autoplay).toBe(false);
  });

  it('exposes current track, upcoming tracks, history and durations', () => {
    expect(adapter.isEmpty).toBe(true);
    expect(adapter.currentTrack).toBeNull();

    player.queue.current = lavalinkTrack('now', 180_000);
    player.queue.tracks.push(lavalinkTrack('next1', 120_000), lavalinkTrack('next2', 60_000));
    player.queue.previous.push(lavalinkTrack('old'));
    player.position = 30_000;

    expect(adapter.isEmpty).toBe(false);
    expect(adapter.currentTrack?.id).toBe('now');
    expect(adapter.tracks.map((t) => t.id)).toEqual(['next1', 'next2']);
    expect(adapter.history.map((t) => t.id)).toEqual(['old']);
    expect(adapter.size).toBe(2);
    expect(adapter.playbackPositionSeconds).toBe(30);
    // 120 + 60 queued, plus 150 left of the current track
    expect(adapter.totalDurationSeconds).toBe(330);
  });

  it('lists the active filters', () => {
    expect(adapter.activeFilters).toEqual([]);
    player.filterManager.filters = {
      nightcore: true,
      vaporwave: true,
      rotation: true,
      karaoke: true,
    };
    player.filterManager.equalizerBands = [{ band: 0, gain: 0.3 }];
    expect(adapter.activeFilters).toEqual(['nightcore', 'vaporwave', '8d', 'karaoke', 'bassboost']);
  });

  it('adds Lavalink tracks directly and starts playback when idle', () => {
    const raw = lavalinkTrack('a');
    expect(adapter.addTrack(lavalinkTrackToQueuedTrack(raw))).toBe(true);
    expect(player.queue.add).toHaveBeenCalledWith(raw);
    expect(player.play).toHaveBeenCalledTimes(1);

    expect(adapter.addTracks([lavalinkTrackToQueuedTrack(lavalinkTrack('b'))])).toBe(1);
    // Already playing, so it is only queued
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.queue.tracks.map((t) => t.info.identifier)).toEqual(['a', 'b']);
  });

  it('searches the node for tracks resolved outside Lavalink', async () => {
    const found = lavalinkTrack('found');
    player.node.search.mockResolvedValue({ tracks: [found] });
    const external = {
      ...lavalinkTrackToQueuedTrack(lavalinkTrack('x')),
      rawTrack: undefined,
      url: 'https://soundcloud.com/artist/song',
    };

    adapter.addTrack(external);
    await vi.waitFor(() => expect(player.queue.add).toHaveBeenCalledWith(found));

    expect(player.node.search).toHaveBeenCalledWith(
      { query: 'https://soundcloud.com/artist/song' },
      external.requestedBy,
    );
    expect(player.play).toHaveBeenCalled();
  });

  it('removes, clears, shuffles, starts and destroys', async () => {
    player.queue.tracks.push(lavalinkTrack('a'), lavalinkTrack('b'), lavalinkTrack('c'));

    expect(adapter.removeTrack(5)).toBeNull();
    expect(adapter.removeTrack(1)?.id).toBe('b');
    adapter.shuffle();
    expect(player.queue.shuffle).toHaveBeenCalled();
    adapter.clear();
    expect(player.queue.tracks).toHaveLength(0);

    await adapter.start();
    expect(player.play).toHaveBeenCalledTimes(1);
    await adapter.start();
    expect(player.play).toHaveBeenCalledTimes(1);

    adapter.destroy();
    expect(player.destroy).toHaveBeenCalled();
  });
});

describe('LavalinkService', () => {
  let service: LavalinkService;
  let player: FakePlayer;

  const playOptions = (query: string): PlayOptions =>
    ({
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      textChannelId: 'text-1',
      member: alice,
      query,
    }) as PlayOptions;

  const primaryNode = () => service.manager.nodeManager.nodes.values().next().value!;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    service = new LavalinkService({ node: { host: '127.0.0.1', port: 2333 } });
    player = createFakePlayer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const addPlayer = () => service.manager.players.set('guild-1', asPlayer(player));

  it('is ready only after init and a node connection', async () => {
    const init = vi.spyOn(service.manager, 'init').mockResolvedValue(service.manager);
    expect(service.isReady()).toBe(false);

    await service.init({ id: 'bot-1' });
    await service.init({ id: 'bot-1' });
    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith({ id: 'bot-1', username: 'Ririko' });
    expect(service.isReady()).toBe(false);

    const node = { options: { host: '127.0.0.1', port: 2333 } };
    const connected = vi.fn();
    service.on('nodeConnect', connected);
    service.manager.nodeManager.emit('connect', node as never);
    expect(service.isReady()).toBe(true);
    expect(connected).toHaveBeenCalledWith(node);

    service.manager.nodeManager.emit('disconnect', node as never, { code: 1006 } as never);
    expect(service.isReady()).toBe(false);
    service.manager.nodeManager.emit('error', node as never, new Error('boom'), undefined as never);
  });

  it('stays uninitialized when the manager fails to start', async () => {
    vi.spyOn(service.manager, 'init').mockRejectedValue(new Error('refused'));
    await service.init({ id: 'bot-1', username: 'Ririko' });
    expect(service.isReady()).toBe(false);
  });

  it('forwards voice payloads and raw gateway data', () => {
    const send = vi.fn();
    service.setSendToShard(send);
    (service.manager.options.sendToShard as (id: string, payload: unknown) => void)('guild-1', {
      op: 4,
    });
    expect(send).toHaveBeenCalledWith('guild-1', { op: 4 });

    const raw = vi.spyOn(service.manager, 'sendRawData').mockImplementation(() => {
      throw new Error('not a voice event');
    });
    expect(() => service.sendRawData({ t: 'MESSAGE_CREATE' })).not.toThrow();
    expect(raw).toHaveBeenCalled();
  });

  it('re-emits player events with queued tracks', () => {
    addPlayer();
    const started = vi.fn();
    const ended = vi.fn();
    const queueEnd = vi.fn();
    const stateChange = vi.fn();
    service.on('trackStart', started);
    service.on('trackEnd', ended);
    service.on('queueEnd', queueEnd);
    service.on('stateChange', stateChange);

    const track = lavalinkTrack('abc');
    service.manager.emit('trackStart', asPlayer(player), track as never, {} as never);
    service.manager.emit('trackStart', asPlayer(player), null, {} as never);
    service.manager.emit('trackEnd', asPlayer(player), track as never, {} as never);
    service.manager.emit('trackEnd', asPlayer(player), null, {} as never);
    service.manager.emit('queueEnd', asPlayer(player), null, {} as never);

    expect(service.getQueue('guild-1')).toBeDefined();
    service.manager.emit('playerDestroy', asPlayer(player));

    expect(started).toHaveBeenCalledTimes(1);
    expect(started.mock.calls[0]?.[1]).toMatchObject({ id: 'abc' });
    expect(ended).toHaveBeenCalledWith(
      'guild-1',
      expect.objectContaining({ id: 'abc' }),
      'finished',
    );
    expect(queueEnd).toHaveBeenCalledWith('guild-1');
    expect(stateChange).toHaveBeenCalledWith('guild-1', 'PLAYING', 'IDLE');
  });

  it('returns one queue adapter per guild that has a player', () => {
    expect(service.getQueue('guild-1')).toBeUndefined();
    addPlayer();
    const queue = service.getQueue('guild-1');
    expect(queue?.textChannelId).toBe('text-1');
    expect(service.getQueue('guild-1')).toBe(queue);
  });

  it('creates a player, connects and plays a single track', async () => {
    const createPlayer = vi.spyOn(service.manager, 'createPlayer').mockImplementation(() => {
      addPlayer();
      return asPlayer(player);
    });
    vi.spyOn(primaryNode(), 'search').mockResolvedValue({
      loadType: 'track',
      tracks: [lavalinkTrack('abc')],
    } as never);

    const result = await service.play(playOptions('ytsearch:song'), 400);

    expect(createPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-1', voiceChannelId: 'voice-1', volume: 150 }),
    );
    expect(player.connect).toHaveBeenCalled();
    expect(player.play).toHaveBeenCalled();
    expect(result).toMatchObject({ type: 'TRACK', tracksAdded: 1, position: 0 });
    expect(result.track?.id).toBe('abc');

    // A second track is queued behind the one playing
    vi.spyOn(primaryNode(), 'search').mockResolvedValue({
      loadType: 'search',
      tracks: [lavalinkTrack('def')],
    } as never);
    const second = await service.play(playOptions('ytsearch:another'));
    expect(second.position).toBe(2);
    expect(createPlayer).toHaveBeenCalledTimes(1);
  });

  it('queues a whole playlist', async () => {
    addPlayer();
    player.connected = true;
    vi.spyOn(primaryNode(), 'search').mockResolvedValue({
      loadType: 'playlist',
      playlist: { title: 'Mix' },
      tracks: [lavalinkTrack('a'), lavalinkTrack('b')],
    } as never);

    const result = await service.play(playOptions('https://www.youtube.com/playlist?list=PL1'));

    expect(player.connect).not.toHaveBeenCalled();
    expect(result).toMatchObject({ type: 'PLAYLIST', tracksAdded: 2, position: 0 });
    expect(result.playlist).toMatchObject({ title: 'Mix', trackCount: 2, source: 'youtube' });
  });

  it('fails when nothing is found', async () => {
    addPlayer();
    player.connected = true;
    vi.spyOn(primaryNode(), 'search').mockResolvedValue({ loadType: 'empty', tracks: [] } as never);

    await expect(service.play(playOptions('nothing'))).rejects.toThrow(
      'No tracks found for query: "nothing"',
    );
  });

  it('controls playback and reports changes', () => {
    const events = vi.fn();
    for (const name of ['stateChange', 'volumeChange', 'loopChange', 'queueShuffled']) {
      service.on(name, (...args: unknown[]) => events(name, ...args));
    }

    expect(service.pause('guild-1')).toBe(false);
    expect(service.skip('guild-1')).toBeNull();
    expect(service.setVolume('guild-1', 50)).toBe(false);
    addPlayer();

    expect(service.pause('guild-1')).toBe(true);
    player.paused = true;
    expect(service.pause('guild-1')).toBe(false);
    expect(service.resume('guild-1')).toBe(true);
    player.paused = false;
    expect(service.resume('guild-1')).toBe(false);

    player.queue.current = lavalinkTrack('now');
    expect(service.skip('guild-1')?.id).toBe('now');
    expect(player.skip).toHaveBeenCalled();

    expect(service.setVolume('guild-1', 999)).toBe(true);
    expect(player.setVolume).toHaveBeenCalledWith(150);

    expect(service.setLoopMode('guild-1', 'TRACK')).toBe(true);
    expect(service.setLoopMode('guild-1', 'QUEUE')).toBe(true);
    expect(service.setLoopMode('guild-1', 'OFF')).toBe(true);
    expect(player.setRepeatMode.mock.calls.map(([mode]) => mode)).toEqual([
      'track',
      'queue',
      'off',
    ]);

    expect(service.shuffle('guild-1')).toBe(false);
    player.queue.tracks.push(lavalinkTrack('a'), lavalinkTrack('b'));
    expect(service.shuffle('guild-1')).toBe(true);

    expect(service.seek('guild-1', 42)).toBe(true);
    expect(player.seek).toHaveBeenCalledWith(42_000);

    expect(events).toHaveBeenCalledWith('stateChange', 'guild-1', 'PLAYING', 'PAUSED');
    expect(events).toHaveBeenCalledWith('stateChange', 'guild-1', 'PAUSED', 'PLAYING');
    expect(events).toHaveBeenCalledWith('volumeChange', 'guild-1', 150, 150);
    expect(events).toHaveBeenCalledWith('loopChange', 'guild-1', 'TRACK', 'QUEUE');
    expect(events).toHaveBeenCalledWith('queueShuffled', 'guild-1', 2);
  });

  it('plays the previous track and keeps the current one next', () => {
    addPlayer();
    expect(service.previous('guild-1')).toBeNull();

    const old = lavalinkTrack('old');
    player.queue.previous.push(old);
    player.queue.current = lavalinkTrack('now');

    expect(service.previous('guild-1')?.id).toBe('old');
    expect(player.play).toHaveBeenCalledWith({ track: old });
    expect(player.queue.tracks[0]?.info.identifier).toBe('now');
  });

  it('applies and clears audio filters', () => {
    expect(service.setFilter('guild-1', 'nightcore')).toBe(false);
    expect(service.clearFilters('guild-1')).toBe(false);
    addPlayer();
    const fm = player.filterManager;

    for (const name of [
      'bassboost',
      'nightcore',
      'vaporwave',
      '8d',
      'karaoke',
      'treble',
    ] as const) {
      expect(service.setFilter('guild-1', name)).toBe(true);
    }
    expect(fm.setEQ).toHaveBeenCalledTimes(2);
    expect(fm.toggleNightcore).toHaveBeenCalled();
    expect(fm.toggleVaporwave).toHaveBeenCalled();
    expect(fm.toggleRotation).toHaveBeenCalledWith(0.2);
    expect(fm.toggleKaraoke).toHaveBeenCalled();
    expect(service.setFilter('guild-1', 'unknown' as never)).toBe(false);

    expect(service.clearFilters('guild-1')).toBe(true);
    expect(fm.resetFilters).toHaveBeenCalled();
  });

  it('stops by clearing the queue and destroying the player, and disconnects', () => {
    service.stop('guild-1');
    service.disconnect('guild-1');
    addPlayer();
    player.queue.tracks.push(lavalinkTrack('a'));
    service.getQueue('guild-1');

    service.disconnect('guild-1');
    expect(player.disconnect).toHaveBeenCalled();

    service.stop('guild-1');
    expect(player.queue.tracks).toHaveLength(0);
    expect(player.destroy).toHaveBeenCalled();
  });
});
