import { EventEmitter } from 'node:events';
import {
  LavalinkManager,
  type Player,
  EQList,
} from 'lavalink-client';
import type { AudioFilterName, LoopMode, QueueState, QueuedTrack } from '../queue/types.js';
import type { PlayOptions, PlayResult } from '../player/types.js';
import type { LavalinkClientOptions } from './types.js';

export function lavalinkTrackToQueuedTrack(
  track: any,
  requester?: any,
): QueuedTrack {
  const info = track?.info || {};
  const pluginInfo = track?.pluginInfo || {};
  const req = requester || track?.userData?.requester;

  return {
    id: info.identifier || info.uri || 'unknown_id',
    title: info.title || 'Unknown Title',
    artist: info.author || 'Unknown Artist',
    durationSeconds: Math.max(0, Math.round((info.duration || 0) / 1000)),
    url: info.uri || `https://www.youtube.com/watch?v=${info.identifier}`,
    thumbnailUrl:
      info.artworkUrl || `https://img.youtube.com/vi/${info.identifier}/hqdefault.jpg`,
    source: (info.sourceName as any) || 'lavalink',
    requestedBy: {
      id: req?.id ? String(req.id) : 'unknown',
      username: req?.username ? String(req.username) : 'User',
      ...(req?.avatarUrl ? { avatarUrl: String(req.avatarUrl) } : {}),
    },
    addedAt: new Date(),
    ...(info.isrc ? { isrc: String(info.isrc) } : {}),
    ...(pluginInfo.albumName ? { album: String(pluginInfo.albumName) } : {}),
    rawTrack: track,
    getStream: async () => {
      throw new Error('Streaming handled by Lavalink audio daemon');
    },
  } as unknown as QueuedTrack;
}

export class LavalinkQueueAdapter extends EventEmitter {
  private readonly player: Player;
  private readonly guildIdVal: string;
  public textChannelId?: string | undefined;

  constructor(player: Player, guildId: string, textChannelId?: string | undefined) {
    super();
    this.player = player;
    this.guildIdVal = guildId;
    this.textChannelId = textChannelId;
  }

  get guildId(): string {
    return this.guildIdVal;
  }

  get state(): QueueState {
    if (this.player.playing) return 'PLAYING';
    if (this.player.paused) return 'PAUSED';
    return 'IDLE';
  }

  get volume(): number {
    return this.player.volume;
  }

  get gain(): number {
    return this.player.volume / 100;
  }

  get loopMode(): LoopMode {
    if (this.player.repeatMode === 'track') return 'TRACK';
    if (this.player.repeatMode === 'queue') return 'QUEUE';
    return 'OFF';
  }

  get currentTrack(): QueuedTrack | null {
    if (!this.player.queue.current) return null;
    return lavalinkTrackToQueuedTrack(this.player.queue.current, this.player.queue.current.requester);
  }

  get tracks(): readonly QueuedTrack[] {
    return this.player.queue.tracks.map((t) => lavalinkTrackToQueuedTrack(t, t.requester));
  }

  get history(): readonly QueuedTrack[] {
    return this.player.queue.previous.map((t) => lavalinkTrackToQueuedTrack(t, t.requester));
  }

  get activeFilters(): AudioFilterName[] {
    const filters: AudioFilterName[] = [];
    const fm = this.player.filterManager;
    if (fm.filters.nightcore) filters.push('nightcore');
    if (fm.filters.vaporwave) filters.push('vaporwave');
    if (fm.filters.rotation) filters.push('8d');
    if (fm.filters.karaoke) filters.push('karaoke');
    if (fm.equalizerBands && fm.equalizerBands.length > 0) filters.push('bassboost');
    return filters;
  }

  get autoplay(): boolean {
    return false;
  }

  get playbackPositionSeconds(): number {
    return Math.round(this.player.position / 1000);
  }

  get size(): number {
    return this.player.queue.tracks.length;
  }

  get totalDurationSeconds(): number {
    const queueSum = this.player.queue.tracks.reduce((acc, t) => acc + Math.round((t.info.duration || 0) / 1000), 0);
    const currentRemaining = this.player.queue.current
      ? Math.max(0, Math.round((this.player.queue.current.info.duration || 0) / 1000) - this.playbackPositionSeconds)
      : 0;
    return queueSum + currentRemaining;
  }

  get isEmpty(): boolean {
    return this.player.queue.tracks.length === 0 && this.player.queue.current === null;
  }

  addTrack(track: QueuedTrack): boolean {
    const raw = (track as any).rawTrack;
    if (raw) {
      this.player.queue.add(raw);
      if (!this.player.playing && !this.player.paused) {
        void this.player.play();
      }
      return true;
    }
    void this.player.node.search({ query: track.url || track.title }, track.requestedBy).then((res) => {
      if (res?.tracks && res.tracks.length > 0) {
        const t = res.tracks[0]!;
        (t as any).requester = track.requestedBy;
        this.player.queue.add(t);
        if (!this.player.playing && !this.player.paused) {
          void this.player.play();
        }
      }
    });
    return true;
  }

  addTracks(tracks: QueuedTrack[]): number {
    for (const t of tracks) {
      this.addTrack(t);
    }
    return tracks.length;
  }

  async start(): Promise<void> {
    if (!this.player.playing && !this.player.paused) {
      await this.player.play();
    }
  }

  destroy(): void {
    void this.player.destroy();
  }

  removeTrack(index: number): QueuedTrack | null {
    if (index < 0 || index >= this.player.queue.tracks.length) return null;
    const [removed] = this.player.queue.tracks.splice(index, 1);
    if (!removed) return null;
    return lavalinkTrackToQueuedTrack(removed, removed.requester);
  }

  clear(): void {
    this.player.queue.tracks.splice(0, this.player.queue.tracks.length);
  }

  shuffle(): void {
    this.player.queue.shuffle();
  }
}


export class LavalinkService extends EventEmitter {
  readonly manager: LavalinkManager;
  private isInitialized = false;
  private isConnectedNode = false;
  private sendToShardFn?: ((guildId: string, payload: unknown) => void) | undefined;
  private readonly options: LavalinkClientOptions;
  private readonly queueAdapters = new Map<string, LavalinkQueueAdapter>();

  constructor(options: LavalinkClientOptions = {}) {
    super();
    this.options = options;

    const host = options.node?.host || process.env.LAVALINK_HOST || '127.0.0.1';
    const port = options.node?.port || parseInt(process.env.LAVALINK_PORT || '2333', 10);
    const password = options.node?.password || process.env.LAVALINK_PASSWORD || 'youshallnotpass';
    const secure = options.node?.secure ?? false;

    this.sendToShardFn = options.sendToShard;

    this.manager = new LavalinkManager({
      nodes: [
        {
          id: 'primary-node',
          host,
          port,
          authorization: password,
          secure,
        },
      ],
      sendToShard: (guildId, payload) => {
        if (this.sendToShardFn) {
          this.sendToShardFn(guildId, payload);
        }
      },
      client: {
        id: options.clientId || process.env.DISCORD_CLIENT_ID || '1311016933021454358',
        username: options.clientUsername || 'Ririko',
      },
      autoSkip: true,
      playerOptions: {
        defaultSearchPlatform: 'ytsearch',
        onDisconnect: {
          autoReconnect: true,
          destroyPlayer: false,
        },
      },
    });

    this.wireManagerEvents();
  }

  private wireManagerEvents(): void {
    this.manager.nodeManager.on('connect', (node) => {
      this.isConnectedNode = true;
      console.log(`[LavalinkService] Connected to Lavalink node: ${node.options.host}:${node.options.port}`);
      this.emit('nodeConnect', node);
    });

    this.manager.nodeManager.on('disconnect', (node, reason) => {
      this.isConnectedNode = false;
      console.warn(`[LavalinkService] Disconnected from Lavalink node: ${node.options.host}:${node.options.port}. Reason:`, reason);
      this.emit('nodeDisconnect', node, reason);
    });

    this.manager.nodeManager.on('error', (node, error) => {
      console.warn(`[LavalinkService] Lavalink node error: ${node.options.host}:${node.options.port}:`, error.message);
    });

    // Player Event Bridges for Reactive Controller & Commands
    this.manager.on('trackStart', (player, track) => {
      if (!track) return;
      const queued = lavalinkTrackToQueuedTrack(track, (track as any).requester);
      this.emit('trackStart', player.guildId, queued);
    });

    this.manager.on('trackEnd', (player, track, payload) => {
      if (!track) return;
      const queued = lavalinkTrackToQueuedTrack(track, (track as any).requester);
      this.emit('trackEnd', player.guildId, queued, payload?.reason || 'finished');
    });

    this.manager.on('queueEnd', (player) => {
      this.emit('queueEnd', player.guildId);
    });

    this.manager.on('playerDestroy', (player) => {
      this.emit('stateChange', player.guildId, 'PLAYING', 'IDLE');
      this.queueAdapters.delete(player.guildId);
    });
  }

  setSendToShard(fn: (guildId: string, payload: unknown) => void): void {
    this.sendToShardFn = fn;
  }

  async init(client: { id: string; username?: string }): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this.manager.init({ id: client.id, username: client.username || 'Ririko' });
      this.isInitialized = true;
    } catch (err) {
      console.warn('[LavalinkService] Failed to initialize LavalinkManager:', err);
    }
  }

  sendRawData(data: unknown): void {
    try {
      this.manager.sendRawData(data as any);
    } catch {
      // Ignore parsing errors on non-voice events
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.isConnectedNode;
  }

  getQueue(guildId: string): LavalinkQueueAdapter | undefined {
    const player = this.manager.players.get(guildId);
    if (!player) return undefined;
    let adapter = this.queueAdapters.get(guildId);
    if (!adapter) {
      adapter = new LavalinkQueueAdapter(player, guildId, player.textChannelId || undefined);
      this.queueAdapters.set(guildId, adapter);
    }
    return adapter;
  }

  async play(options: PlayOptions): Promise<PlayResult> {
    let player = this.manager.players.get(options.guildId);
    if (!player) {
      player = this.manager.createPlayer({
        guildId: options.guildId,
        voiceChannelId: options.voiceChannelId,
        ...(options.textChannelId ? { textChannelId: options.textChannelId } : {}),
        selfDeaf: true,
        volume: 80,
      });
      const adapter = new LavalinkQueueAdapter(
        player,
        options.guildId,
        options.textChannelId || undefined,
      );
      this.queueAdapters.set(options.guildId, adapter);
    }

    if (!player.connected) {
      await player.connect();
    }

    // Load track via Lavalink (LavaSrc natively supports Spotify URLs and matches via ISRC)
    const node = this.manager.nodeManager.nodes.values().next().value;
    if (!node) {
      throw new Error('No Lavalink node available.');
    }

    const res = await node.search({ query: options.query }, options.member);

    if (!res || !res.tracks || res.tracks.length === 0) {
      throw new Error(`No tracks found for query: "${options.query}"`);
    }

    if (res.loadType === 'playlist') {
      for (const t of res.tracks) {
        (t as any).requester = options.member;
      }
      player.queue.add(res.tracks);
      const isFirst = !player.playing && !player.paused;
      if (isFirst) {
        await player.play();
      }

      const playlistInfo = res.playlist;
      const queuedTracks = res.tracks.map((t) => lavalinkTrackToQueuedTrack(t, options.member));

      return {
        type: 'PLAYLIST',
        playlist: {
          title: playlistInfo?.title || 'Lavalink Playlist',
          url: options.query,
          thumbnailUrl: queuedTracks[0]?.thumbnailUrl,
          trackCount: queuedTracks.length,
          tracks: queuedTracks,
          source: (queuedTracks[0]?.source as any) || 'lavalink',
        },
        tracksAdded: res.tracks.length,
        position: isFirst ? 0 : player.queue.tracks.length - res.tracks.length + 1,
      };
    } else {
      const track = res.tracks[0]!;
      (track as any).requester = options.member;
      const queued = lavalinkTrackToQueuedTrack(track, options.member);

      const isFirst = !player.playing && !player.paused;
      player.queue.add(track);

      if (isFirst) {
        await player.play();
      }

      return {
        type: 'TRACK',
        track: queued,
        tracksAdded: 1,
        position: isFirst ? 0 : player.queue.tracks.length,
      };
    }
  }

  pause(guildId: string): boolean {
    const player = this.manager.players.get(guildId);
    if (!player || player.paused) return false;
    void player.pause();
    this.emit('stateChange', guildId, 'PLAYING', 'PAUSED');
    return true;
  }

  resume(guildId: string): boolean {
    const player = this.manager.players.get(guildId);
    if (!player || !player.paused) return false;
    void player.resume();
    this.emit('stateChange', guildId, 'PAUSED', 'PLAYING');
    return true;
  }

  skip(guildId: string): QueuedTrack | null {
    const player = this.manager.players.get(guildId);
    if (!player) return null;
    const current = player.queue.current ? lavalinkTrackToQueuedTrack(player.queue.current, player.queue.current.requester) : null;
    void player.skip();
    return current;
  }

  previous(guildId: string): QueuedTrack | null {
    const player = this.manager.players.get(guildId);
    if (!player || player.queue.previous.length === 0) return null;
    const prev = player.queue.previous.shift();
    if (!prev) return null;
    if (player.queue.current) {
      player.queue.tracks.unshift(player.queue.current);
    }
    void player.play({ track: prev });
    return lavalinkTrackToQueuedTrack(prev, prev.requester);
  }

  stop(guildId: string): void {
    const player = this.manager.players.get(guildId);
    if (!player) return;
    player.queue.tracks.splice(0, player.queue.tracks.length);
    void player.destroy();
    this.queueAdapters.delete(guildId);
  }

  setVolume(guildId: string, volume: number): boolean {
    const player = this.manager.players.get(guildId);
    if (!player) return false;
    const clamped = Math.max(0, Math.min(150, volume));
    void player.setVolume(clamped);
    this.emit('volumeChange', guildId, player.volume, clamped);
    return true;
  }

  setLoopMode(guildId: string, mode: LoopMode): boolean {
    const player = this.manager.players.get(guildId);
    if (!player) return false;
    const oldMode: LoopMode = player.repeatMode === 'track' ? 'TRACK' : (player.repeatMode === 'queue' ? 'QUEUE' : 'OFF');
    if (mode === 'TRACK') player.setRepeatMode('track');
    else if (mode === 'QUEUE') player.setRepeatMode('queue');
    else player.setRepeatMode('off');
    this.emit('loopChange', guildId, oldMode, mode);
    return true;
  }

  shuffle(guildId: string): boolean {
    const player = this.manager.players.get(guildId);
    if (!player || player.queue.tracks.length < 2) return false;
    player.queue.shuffle();
    this.emit('queueShuffled', guildId, player.queue.tracks.length);
    return true;
  }

  seek(guildId: string, positionSeconds: number): boolean {
    const player = this.manager.players.get(guildId);
    if (!player || !player.queue.current) return false;
    void player.seek(positionSeconds * 1000);
    return true;
  }

  setFilter(guildId: string, filterName: AudioFilterName): boolean {
    const player = this.manager.players.get(guildId);
    if (!player) return false;

    const fm = player.filterManager;
    switch (filterName) {
      case 'bassboost':
      case 'bassboost_high':
        void fm.setEQ(EQList.BassboostHigh);
        break;
      case 'nightcore':
        void fm.toggleNightcore();
        break;
      case 'vaporwave':
        void fm.toggleVaporwave();
        break;
      case '8d':
        void fm.toggleRotation(0.2);
        break;
      case 'karaoke':
        void fm.toggleKaraoke();
        break;
      case 'treble':
        void fm.setEQ(EQList.BetterMusic);
        break;
      default:
        return false;
    }
    this.emit('filterChange', guildId, [filterName], []);
    return true;
  }

  clearFilters(guildId: string): boolean {
    const player = this.manager.players.get(guildId);
    if (!player) return false;
    void player.filterManager.resetFilters();
    this.emit('filterChange', guildId, [], []);
    return true;
  }

  disconnect(guildId: string): void {
    const player = this.manager.players.get(guildId);
    if (player) {
      void player.disconnect();
    }
  }
}
