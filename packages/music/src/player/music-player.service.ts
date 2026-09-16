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
import type { ResolvedTrack } from '../types.js';

export interface MusicPlayerServiceOptions {
  pipeline?: ExtractorPipeline | undefined;
  queueManager?: QueueManager | undefined;
  defaultVolume?: number | undefined;
  idleTimeoutMs?: number | undefined;
}

export class MusicPlayerService extends EventEmitter {
  readonly pipeline: ExtractorPipeline;
  readonly queueManager: QueueManager;
  readonly autoplayEngine: AutoplayEngine;

  private readonly voiceManagers = new Map<string, VoiceLifecycleManager>();
  private readonly audioPlayers = new Map<string, AudioPlayer>();
  private readonly activeResources = new Map<string, AudioResource>();
  private readonly defaultVolume: number;
  private readonly idleTimeoutMs: number;

  constructor(options?: MusicPlayerServiceOptions) {
    super();
    this.pipeline = options?.pipeline ?? new ExtractorPipeline();
    this.queueManager = options?.queueManager ?? new QueueManager();
    this.autoplayEngine = new AutoplayEngine({ pipeline: this.pipeline });
    this.defaultVolume = options?.defaultVolume ?? 80;
    this.idleTimeoutMs = options?.idleTimeoutMs ?? 180_000;
  }

  // --- Queue & Voice Lifecycle Accessors ---

  getQueue(guildId: string): GuildQueue | undefined {
    return this.queueManager.get(guildId);
  }

  getOrCreateQueue(guildId: string, textChannelId?: string): GuildQueue {
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
          // Playback of current track finished naturally
          const queue = this.getQueue(guildId);
          if (queue) {
            await queue.onTrackFinished('finished');
          }
        }
      });

      player.on('error', (err) => {
        const queue = this.getQueue(guildId);
        if (queue) {
          queue.emit('error', err);
          queue.skip();
        }
      });

      this.audioPlayers.set(guildId, player);
    }
    return player;
  }

  // --- Main Playback Commands ---

  async play(options: PlayOptions): Promise<PlayResult> {
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

      const addedCount = queue.addTracks(queuedTracks);
      const isFirst = queue.currentTrack === null;

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

      const isFirst = queue.currentTrack === null;
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
    const queue = this.queueManager.get(guildId);
    if (!queue) return null;
    return queue.skip();
  }

  previous(guildId: string): QueuedTrack | null {
    const queue = this.queueManager.get(guildId);
    if (!queue) return null;
    return queue.previous();
  }

  stop(guildId: string): void {
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
    const queue = this.getOrCreateQueue(guildId);
    const clamped = queue.setVolume(volume);

    const resource = this.activeResources.get(guildId);
    if (resource?.volume) {
      resource.volume.setVolume(queue.gain);
    }

    return clamped;
  }

  setLoopMode(guildId: string, mode: LoopMode): void {
    const queue = this.getOrCreateQueue(guildId);
    queue.setLoopMode(mode);
  }

  shuffle(guildId: string): number {
    const queue = this.getOrCreateQueue(guildId);
    queue.shuffle();
    return queue.size;
  }

  async seek(guildId: string, seconds: number): Promise<void> {
    const queue = this.getOrCreateQueue(guildId);
    queue.seek(seconds);

    // Replay stream starting at seeked position
    if (queue.currentTrack) {
      await this.playTrackStream(guildId, queue.currentTrack);
    }
  }

  toggleFilter(guildId: string, filter: AudioFilterName): boolean {
    const queue = this.getOrCreateQueue(guildId);
    const isActive = queue.toggleFilter(filter);
    // Restart current stream to apply new FFmpeg filter
    if (queue.currentTrack) {
      void this.playTrackStream(guildId, queue.currentTrack);
    }
    return isActive;
  }

  setFilter(guildId: string, filter: AudioFilterName, enabled: boolean): void {
    const queue = this.getOrCreateQueue(guildId);
    queue.setFilter(filter, enabled);
    if (queue.currentTrack) {
      void this.playTrackStream(guildId, queue.currentTrack);
    }
  }

  clearFilters(guildId: string): void {
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
    const vm = this.getOrCreateVoiceManager(guildId);
    return await vm.join({
      channelId,
      adapterCreator,
      selfDeaf: true,
    });
  }

  leave(guildId: string): void {
    this.stop(guildId);
  }

  isPlaying(guildId: string): boolean {
    const queue = this.queueManager.get(guildId);
    return queue !== undefined && queue.state === 'PLAYING';
  }

  isPaused(guildId: string): boolean {
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

    queue.on('queueCleared', () => {
      this.emit('queueCleared', guildId);
    });

    queue.on('queueShuffled', (count) => {
      this.emit('queueShuffled', guildId, count);
    });

    queue.on('error', (err, track) => {
      this.emit('error', guildId, err, track);
    });

    queue.on('queueEnd', () => {
      const player = this.audioPlayers.get(guildId);
      if (player) {
        player.stop();
      }
      this.emit('queueEnd', guildId);
    });
  }

  private async playTrackStream(guildId: string, track: ResolvedTrack): Promise<void> {
    try {
      const player = this.getOrCreateAudioPlayer(guildId);
      const queue = this.getOrCreateQueue(guildId);

      const rawStream = await track.getStream();
      const nodeStream = rawStream as Readable;

      const resource = createAudioResource(nodeStream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
      });

      resource.volume?.setVolume(queue.gain);
      this.activeResources.set(guildId, resource);

      player.play(resource);
    } catch (err) {
      const queue = this.getQueue(guildId);
      if (queue) {
        queue.emit('error', err instanceof Error ? err : new Error(String(err)));
        // Auto-skip failed track
        queue.skip();
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
