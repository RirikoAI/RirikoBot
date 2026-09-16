import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  type AudioPlayer,
  type AudioResource,
  type DiscordGatewayAdapterCreator,
  type VoiceConnection,
} from '@discordjs/voice';
import { ExtractorPipeline } from '../extractors/pipeline.js';
import { QueueManager } from '../queue/queue-manager.js';
import { GuildQueue } from '../queue/guild-queue.js';
import { AutoplayEngine } from '../queue/autoplay.js';
import { VoiceLifecycleManager } from '../voice/voice-lifecycle-manager.js';
import type { AudioFilterName, LoopMode, QueuedTrack } from '../queue/types.js';
import type { PlayOptions, PlayResult } from './types.js';
import type { ExtractorPipelineOptions } from '../types.js';
import { LavalinkService, type LavalinkClientOptions } from '../lavalink/index.js';

export interface MusicPlayerServiceOptions {
  pipeline?: ExtractorPipeline | undefined;
  queueManager?: QueueManager | undefined;
  defaultVolume?: number | undefined;
  idleTimeoutMs?: number | undefined;
  youtubeOptions?: ExtractorPipelineOptions['youtubeOptions'];
  lavalink?: LavalinkClientOptions | undefined;
}

export class MusicPlayerService extends EventEmitter {
  readonly pipeline: ExtractorPipeline;
  readonly queueManager: QueueManager;
  readonly autoplayEngine: AutoplayEngine;
  readonly lavalinkService?: LavalinkService | undefined;

  private readonly voiceManagers = new Map<string, VoiceLifecycleManager>();
  private readonly audioPlayers = new Map<string, AudioPlayer>();
  private readonly activeResources = new Map<string, AudioResource>();
  private readonly skipInitiated = new Set<string>();
  private readonly defaultVolume: number;
  private readonly idleTimeoutMs: number;

  constructor(options?: MusicPlayerServiceOptions) {
    super();
    this.pipeline =
      options?.pipeline ?? new ExtractorPipeline({ youtubeOptions: options?.youtubeOptions });
    this.queueManager = options?.queueManager ?? new QueueManager();
    this.autoplayEngine = new AutoplayEngine({ pipeline: this.pipeline });
    this.defaultVolume = options?.defaultVolume ?? 80;
    this.idleTimeoutMs = options?.idleTimeoutMs ?? 180_000;

    if (options?.lavalink && options.lavalink.enabled !== false) {
      this.lavalinkService = new LavalinkService(options.lavalink);
      this.wireLavalinkEvents();
    }

    // Prevent unhandled 'error' events from crashing Node.js runtime
    this.on('error', (guildId, err, track) => {
      console.error(`[MusicPlayerService] Error event for guild ${guildId}:`, err, track?.title);
    });
  }

  private wireLavalinkEvents(): void {
    if (!this.lavalinkService) return;
    this.lavalinkService.on('trackStart', (guildId, track) => this.emit('trackStart', guildId, track));
    this.lavalinkService.on('trackEnd', (guildId, track, reason) => this.emit('trackEnd', guildId, track, reason));
    this.lavalinkService.on('stateChange', (guildId, oldState, newState) => this.emit('stateChange', guildId, oldState, newState));
    this.lavalinkService.on('queueEnd', (guildId) => this.emit('queueEnd', guildId));
    this.lavalinkService.on('volumeChange', (guildId, oldVol, newVol) => this.emit('volumeChange', guildId, oldVol, newVol));
    this.lavalinkService.on('loopChange', (guildId, oldMode, newMode) => this.emit('loopChange', guildId, oldMode, newMode));
    this.lavalinkService.on('filterChange', (guildId, filters, args) => this.emit('filterChange', guildId, filters, args));
    this.lavalinkService.on('queueShuffled', (guildId, count) => this.emit('queueShuffled', guildId, count));
  }

  isLavalinkActive(): boolean {
    return Boolean(this.lavalinkService?.isReady());
  }

  sendRawData(data: unknown): void {
    this.lavalinkService?.sendRawData(data);
  }

  setSendToShard(fn: (guildId: string, payload: unknown) => void): void {
    this.lavalinkService?.setSendToShard(fn);
  }

  async initLavalink(client: { id: string; username?: string }): Promise<void> {
    await this.lavalinkService?.init(client);
  }

  // --- Queue & Voice Lifecycle Accessors ---

  getQueue(guildId: string): GuildQueue | undefined {
    if (this.isLavalinkActive()) {
      return this.lavalinkService!.getQueue(guildId) as any;
    }
    return this.queueManager.get(guildId);
  }

  getOrCreateQueue(guildId: string, textChannelId?: string): GuildQueue {
    if (this.isLavalinkActive()) {
      const adapter = this.lavalinkService!.getQueue(guildId);
      if (adapter) {
        if (textChannelId) adapter.textChannelId = textChannelId;
        return adapter as unknown as GuildQueue;
      }
    }

    let queue = this.queueManager.get(guildId);
    if (!queue) {
      queue = this.queueManager.getOrCreate(guildId, {
        defaultVolume: this.defaultVolume,
        idleTimeoutMs: this.idleTimeoutMs,
        textChannelId,
      });
      queue.setAutoplayEngine(this.autoplayEngine);
      this.wireQueueEvents(guildId, queue);
    } else if (textChannelId) {
      queue.textChannelId = textChannelId;
    }
    return queue;
  }

  getVoiceManager(guildId: string): VoiceLifecycleManager | undefined {
    return this.voiceManagers.get(guildId);
  }

  getOrCreateVoiceManager(guildId: string): VoiceLifecycleManager {
    let vm = this.voiceManagers.get(guildId);
    if (!vm) {
      vm = new VoiceLifecycleManager({
        guildId,
        idleTimeoutMs: this.idleTimeoutMs,
      });

      const queue = this.getOrCreateQueue(guildId);
      vm.bindQueue(queue);

      vm.on('disconnected', () => {
        this.cleanupGuild(guildId);
      });

      this.voiceManagers.set(guildId, vm);
    }
    return vm;
  }

  getOrCreateAudioPlayer(guildId: string): AudioPlayer {
    let player = this.audioPlayers.get(guildId);
    if (!player) {
      player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Pause,
        },
      });

      player.on('stateChange', async (oldState, newState) => {
        if (
          newState.status === AudioPlayerStatus.Idle &&
          oldState.status !== AudioPlayerStatus.Idle
        ) {
          if (this.skipInitiated.has(guildId)) {
            // Idle transition caused by skip or failure handling, ignore to avoid double skip
            return;
          }
          // Playback of current track finished naturally
          const queue = this.getQueue(guildId);
          if (queue && queue.state === 'PLAYING') {
            await queue.onTrackFinished('finished');
          }
        }
      });

      player.on('error', (err) => {
        const queue = this.getQueue(guildId);
        if (queue && queue.currentTrack) {
          queue.emit('error', err, queue.currentTrack);
          this.handlePlaybackFailure(guildId, queue.currentTrack, err);
        }
      });

      this.audioPlayers.set(guildId, player);
    }
    return player;
  }

  // --- Main Playback Commands ---

  async play(options: PlayOptions): Promise<PlayResult> {
    if (this.isLavalinkActive()) {
      return await this.lavalinkService!.play(options);
    }

    const queue = this.getOrCreateQueue(options.guildId, options.textChannelId);
    const voiceManager = this.getOrCreateVoiceManager(options.guildId);

    // 1. Join Voice Channel if not already connected
    const connection = await voiceManager.join({
      channelId: options.voiceChannelId,
      adapterCreator: options.adapterCreator,
      selfDeaf: true,
    });

    // 2. Subscribe AudioPlayer to VoiceConnection
    const player = this.getOrCreateAudioPlayer(options.guildId);
    connection.subscribe(player);

    // 3. Resolve Track or Playlist via ExtractorPipeline
    const resolved = await this.pipeline.resolve(options.query);

    if ('tracks' in resolved) {
      // Playlist
      const queuedTracks: QueuedTrack[] = resolved.tracks.map((t) => ({
        ...t,
        requestedBy: options.member,
        addedAt: new Date(),
      }));

      const isFirst = queue.currentTrack === null || queue.state === 'IDLE';
      if (isFirst && queue.currentTrack !== null) {
        queue.skip(true);
      }
      const addedCount = queue.addTracks(queuedTracks);

      if (isFirst) {
        queue.start();
      }

      return {
        type: 'PLAYLIST',
        playlist: resolved,
        tracksAdded: addedCount,
        position: isFirst ? 0 : queue.size - addedCount + 1,
      };
    } else {
      // Single Track
      const queuedTrack: QueuedTrack = {
        ...resolved,
        requestedBy: options.member,
        addedAt: new Date(),
      };

      const isFirst = queue.currentTrack === null || queue.state === 'IDLE';
      if (isFirst && queue.currentTrack !== null) {
        queue.skip(true);
      }
      queue.addTrack(queuedTrack);

      if (isFirst) {
        queue.start();
      }

      return {
        type: 'TRACK',
        track: queuedTrack,
        tracksAdded: 1,
        position: isFirst ? 0 : queue.size,
      };
    }
  }

  pause(guildId: string): boolean {
    if (this.isLavalinkActive()) {
      return this.lavalinkService!.pause(guildId);
    }
    const player = this.audioPlayers.get(guildId);
    const queue = this.queueManager.get(guildId);
    if (player && queue && queue.state === 'PLAYING') {
      player.pause();
      queue.setState('PAUSED');
      return true;
    }
    return false;
  }

  resume(guildId: string): boolean {
    if (this.isLavalinkActive()) {
      return this.lavalinkService!.resume(guildId);
    }
    const player = this.audioPlayers.get(guildId);
    const queue = this.queueManager.get(guildId);
    if (player && queue && queue.state === 'PAUSED') {
      player.unpause();
      queue.setState('PLAYING');
      return true;
    }
    return false;
  }

  skip(guildId: string): QueuedTrack | null {
    if (this.isLavalinkActive()) {
      return this.lavalinkService!.skip(guildId);
    }
    const queue = this.queueManager.get(guildId);
    if (!queue) return null;
    const player = this.audioPlayers.get(guildId);
    this.skipInitiated.add(guildId);
    try {
      if (player) {
        player.stop();
      }
      return queue.skip();
    } finally {
      setTimeout(() => this.skipInitiated.delete(guildId), 150);
    }
  }

  previous(guildId: string): QueuedTrack | null {
    if (this.isLavalinkActive()) {
      return this.lavalinkService!.previous(guildId);
    }
    const queue = this.queueManager.get(guildId);
    if (!queue) return null;
    return queue.previous();
  }

  stop(guildId: string): void {
    if (this.isLavalinkActive()) {
      this.lavalinkService!.stop(guildId);
      return;
    }
    const player = this.audioPlayers.get(guildId);
    if (player) {
      player.stop();
    }

    const queue = this.queueManager.get(guildId);
    if (queue) {
      queue.clear();
      queue.destroy();
      this.queueManager.delete(guildId);
    }

    const vm = this.voiceManagers.get(guildId);
    if (vm) {
      vm.disconnect('MANUAL');
    }

    this.cleanupGuild(guildId);
  }

  setVolume(guildId: string, volume: number): number {
    if (this.isLavalinkActive()) {
      this.lavalinkService!.setVolume(guildId, volume);
      return Math.max(0, Math.min(150, volume));
    }
    const queue = this.getOrCreateQueue(guildId);
    const clamped = queue.setVolume(volume);

    const resource = this.activeResources.get(guildId);
    if (resource?.volume) {
      resource.volume.setVolume(queue.gain);
    }

    return clamped;
  }

  setLoopMode(guildId: string, mode: LoopMode): void {
    if (this.isLavalinkActive()) {
      this.lavalinkService!.setLoopMode(guildId, mode);
      return;
    }
    const queue = this.getOrCreateQueue(guildId);
    queue.setLoopMode(mode);
  }

  shuffle(guildId: string): number {
    if (this.isLavalinkActive()) {
      this.lavalinkService!.shuffle(guildId);
      return this.getQueue(guildId)?.size ?? 0;
    }
    const queue = this.getOrCreateQueue(guildId);
    queue.shuffle();
    return queue.size;
  }

  async seek(guildId: string, seconds: number): Promise<void> {
    if (this.isLavalinkActive()) {
      this.lavalinkService!.seek(guildId, seconds);
      return;
    }
    const queue = this.getOrCreateQueue(guildId);
    queue.seek(seconds);

    // Replay stream starting at seeked position
    if (queue.currentTrack) {
      await this.playTrackStream(guildId, queue.currentTrack);
    }
  }

  toggleFilter(guildId: string, filter: AudioFilterName): boolean {
    if (this.isLavalinkActive()) {
      return this.lavalinkService!.setFilter(guildId, filter);
    }
    const queue = this.getOrCreateQueue(guildId);
    const isActive = queue.toggleFilter(filter);
    // Restart current stream to apply new FFmpeg filter
    if (queue.currentTrack) {
      void this.playTrackStream(guildId, queue.currentTrack);
    }
    return isActive;
  }

  setFilter(guildId: string, filter: AudioFilterName, enabled: boolean): void {
    if (this.isLavalinkActive()) {
      if (enabled) this.lavalinkService!.setFilter(guildId, filter);
      else this.lavalinkService!.clearFilters(guildId);
      return;
    }
    const queue = this.getOrCreateQueue(guildId);
    queue.setFilter(filter, enabled);
    if (queue.currentTrack) {
      void this.playTrackStream(guildId, queue.currentTrack);
    }
  }

  clearFilters(guildId: string): void {
    if (this.isLavalinkActive()) {
      this.lavalinkService!.clearFilters(guildId);
      return;
    }
    const queue = this.getOrCreateQueue(guildId);
    queue.clearFilters();
    if (queue.currentTrack) {
      void this.playTrackStream(guildId, queue.currentTrack);
    }
  }

  async join(
    guildId: string,
    channelId: string,
    adapterCreator: DiscordGatewayAdapterCreator,
  ): Promise<VoiceConnection> {
    if (this.isLavalinkActive()) {
      let player = this.lavalinkService!.manager.players.get(guildId);
      if (!player) {
        player = this.lavalinkService!.manager.createPlayer({
          guildId,
          voiceChannelId: channelId,
          selfDeaf: true,
          volume: 80,
        });
      }
      if (!player.connected) {
        await player.connect();
      }
      return null as any;
    }
    const vm = this.getOrCreateVoiceManager(guildId);
    return await vm.join({
      channelId,
      adapterCreator,
      selfDeaf: true,
    });
  }

  leave(guildId: string): void {
    if (this.isLavalinkActive()) {
      this.lavalinkService!.disconnect(guildId);
      return;
    }
    this.stop(guildId);
  }

  isPlaying(guildId: string): boolean {
    if (this.isLavalinkActive()) {
      return this.getQueue(guildId)?.state === 'PLAYING';
    }
    const queue = this.queueManager.get(guildId);
    if (!queue || queue.state !== 'PLAYING') return false;
    const player = this.audioPlayers.get(guildId);
    if (!player || !player.state) return true;
    return player.state.status !== AudioPlayerStatus.Idle;
  }

  isPaused(guildId: string): boolean {
    if (this.isLavalinkActive()) {
      return this.getQueue(guildId)?.state === 'PAUSED';
    }
    const queue = this.queueManager.get(guildId);
    return queue !== undefined && queue.state === 'PAUSED';
  }

  // --- Internal Stream Playback & Wiring ---

  private wireQueueEvents(guildId: string, queue: GuildQueue): void {
    queue.on('trackStart', async (track) => {
      this.emit('trackStart', guildId, track);
      await this.playTrackStream(guildId, track);
    });

    queue.on('trackEnd', (track, reason) => {
      this.emit('trackEnd', guildId, track, reason);
    });

    queue.on('stateChange', (oldState, newState) => {
      this.emit('stateChange', guildId, oldState, newState);
    });

    queue.on('volumeChange', (oldVolume, newVolume) => {
      const resource = this.activeResources.get(guildId);
      if (resource?.volume) {
        resource.volume.setVolume(queue.gain);
      }
      this.emit('volumeChange', guildId, oldVolume, newVolume);
    });

    queue.on('filterChange', (filters, ffmpegArgs) => {
      this.emit('filterChange', guildId, filters, ffmpegArgs);
    });

    queue.on('loopChange', (oldMode, newMode) => {
      this.emit('loopChange', guildId, oldMode, newMode);
    });

    queue.on('trackAdded', (track) => {
      this.emit('trackAdded', guildId, track);
    });

    queue.on('tracksAdded', (tracks) => {
      this.emit('tracksAdded', guildId, tracks);
      if (tracks.length > 0 && tracks[0]) {
        this.emit('trackAdded', guildId, tracks[0]);
      }
    });

    queue.on('queueCleared', () => {
      this.emit('queueCleared', guildId);
    });

    queue.on('queueShuffled', (count) => {
      this.emit('queueShuffled', guildId, count);
    });

    queue.on('error', (err, track) => {
      if (this.listenerCount('error') > 0) {
        this.emit('error', guildId, err, track);
      } else {
        console.error(
          `[MusicPlayerService] Playback error in guild ${guildId} for track "${track?.title ?? 'Unknown'}":`,
          err,
        );
      }
    });

    queue.on('queueEnd', () => {
      const player = this.audioPlayers.get(guildId);
      if (player) {
        player.stop();
      }
      this.emit('queueEnd', guildId);
    });
  }

  private async playTrackStream(guildId: string, track: QueuedTrack): Promise<void> {
    try {
      const player = this.getOrCreateAudioPlayer(guildId);
      const queue = this.getOrCreateQueue(guildId);

      const rawStream = await track.getStream();
      const nodeStream = rawStream as Readable;

      if (typeof (nodeStream as any).on === 'function') {
        (nodeStream as any).on('error', (streamErr: any) => {
          console.error(`[MusicPlayerService] Audio stream error in guild ${guildId}:`, streamErr);
          const q = this.getQueue(guildId);
          if (q && q.currentTrack?.id === track.id) {
            q.emit('error', streamErr instanceof Error ? streamErr : new Error(String(streamErr)), track);
            this.handlePlaybackFailure(guildId, track, streamErr);
          }
        });
      }

      const resource = createAudioResource(nodeStream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
      });

      resource.volume?.setVolume(queue.gain);
      this.activeResources.set(guildId, resource);

      player.play(resource);
    } catch (err) {
      console.error(
        `[MusicPlayerService] Failed to play track "${track.title}" in guild ${guildId}:`,
        err,
      );
      const queue = this.getQueue(guildId);
      if (queue && queue.currentTrack?.id === track.id) {
        queue.emit('error', err instanceof Error ? err : new Error(String(err)), track);
        this.handlePlaybackFailure(guildId, track, err);
      }
    }
  }

  private handlePlaybackFailure(guildId: string, track: QueuedTrack, _err: unknown): void {
    const queue = this.getQueue(guildId);
    if (!queue) return;

    if (queue.currentTrack && queue.currentTrack.id === track.id) {
      const player = this.audioPlayers.get(guildId);
      this.skipInitiated.add(guildId);
      try {
        if (player) {
          player.stop();
        }
        queue.skip(true);
      } finally {
        setTimeout(() => this.skipInitiated.delete(guildId), 150);
      }
    }
  }

  private cleanupGuild(guildId: string): void {
    const player = this.audioPlayers.get(guildId);
    if (player) {
      player.stop();
      this.audioPlayers.delete(guildId);
    }

    this.activeResources.delete(guildId);
    this.voiceManagers.delete(guildId);
  }
}
