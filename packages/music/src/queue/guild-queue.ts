import { EventEmitter } from 'node:events';
import {
  type AudioFilterName,
  type GuildQueueOptions,
  type LoopMode,
  type QueueEvents,
  type QueueState,
  type QueuedTrack,
} from './types.js';
import { buildFilterArgs, clampVolume, isValidFilter, volumeToGain } from './filters.js';
import type { AutoplayEngine } from './autoplay.js';

export interface ResolvedQueueOptions {
  guildId: string;
  textChannelId: string;
  voiceChannelId: string;
  defaultVolume: number;
  leaveOnEmpty: boolean;
  leaveOnEnd: boolean;
  idleTimeoutMs: number;
  maxQueueSize: number;
  maxHistorySize: number;
  autoplay: boolean;
}

const DEFAULT_OPTIONS: ResolvedQueueOptions = {
  guildId: '',
  textChannelId: '',
  voiceChannelId: '',
  defaultVolume: 80,
  leaveOnEmpty: true,
  leaveOnEnd: true,
  idleTimeoutMs: 180_000, // 3 minutes
  maxQueueSize: 1000,
  maxHistorySize: 100,
  autoplay: false,
};

export class GuildQueue extends EventEmitter {
  readonly guildId: string;
  textChannelId?: string | undefined;
  voiceChannelId?: string | undefined;
  readonly options: ResolvedQueueOptions;

  private _state: QueueState = 'IDLE';
  private _volume: number;
  private _loopMode: LoopMode = 'OFF';
  private _currentTrack: QueuedTrack | null = null;
  private _tracks: QueuedTrack[] = [];
  private _history: QueuedTrack[] = [];
  private readonly _activeFilters: Set<AudioFilterName> = new Set();
  private _autoplay: boolean;
  private _playbackPositionSeconds = 0;
  private _autoplayEngine?: AutoplayEngine | undefined;

  constructor(options: GuildQueueOptions) {
    super();
    this.guildId = options.guildId;
    this.textChannelId = options.textChannelId;
    this.voiceChannelId = options.voiceChannelId;
    this.options = {
      guildId: options.guildId,
      textChannelId: options.textChannelId ?? DEFAULT_OPTIONS.textChannelId,
      voiceChannelId: options.voiceChannelId ?? DEFAULT_OPTIONS.voiceChannelId,
      defaultVolume: options.defaultVolume ?? DEFAULT_OPTIONS.defaultVolume,
      leaveOnEmpty: options.leaveOnEmpty ?? DEFAULT_OPTIONS.leaveOnEmpty,
      leaveOnEnd: options.leaveOnEnd ?? DEFAULT_OPTIONS.leaveOnEnd,
      idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_OPTIONS.idleTimeoutMs,
      maxQueueSize: options.maxQueueSize ?? DEFAULT_OPTIONS.maxQueueSize,
      maxHistorySize: options.maxHistorySize ?? DEFAULT_OPTIONS.maxHistorySize,
      autoplay: options.autoplay ?? DEFAULT_OPTIONS.autoplay,
    };

    this._volume = clampVolume(this.options.defaultVolume);
    this._autoplay = this.options.autoplay;
  }

  // --- Getters ---

  get state(): QueueState {
    return this._state;
  }

  get volume(): number {
    return this._volume;
  }

  get gain(): number {
    return volumeToGain(this._volume);
  }

  get loopMode(): LoopMode {
    return this._loopMode;
  }

  get currentTrack(): QueuedTrack | null {
    return this._currentTrack;
  }

  get tracks(): readonly QueuedTrack[] {
    return [...this._tracks];
  }

  get history(): readonly QueuedTrack[] {
    return [...this._history];
  }

  get activeFilters(): AudioFilterName[] {
    return Array.from(this._activeFilters);
  }

  get autoplay(): boolean {
    return this._autoplay;
  }

  get playbackPositionSeconds(): number {
    return this._playbackPositionSeconds;
  }

  get size(): number {
    return this._tracks.length;
  }

  get totalDurationSeconds(): number {
    const queueSum = this._tracks.reduce((acc, t) => acc + (t.durationSeconds || 0), 0);
    const currentRemaining = this._currentTrack
      ? Math.max(0, this._currentTrack.durationSeconds - this._playbackPositionSeconds)
      : 0;
    return queueSum + currentRemaining;
  }

  get isEmpty(): boolean {
    return this._tracks.length === 0 && this._currentTrack === null;
  }

  // --- Queue State & Lifecycle ---

  setState(newState: QueueState): void {
    if (this._state === newState) return;
    const oldState = this._state;
    this._state = newState;
    this.emit('stateChange', oldState, newState);
  }

  setAutoplayEngine(engine: AutoplayEngine): void {
    this._autoplayEngine = engine;
  }

  setAutoplay(enabled: boolean): void {
    this._autoplay = enabled;
  }

  // --- Track Management ---

  /**
   * Adds a single track to the queue. Returns false if the queue reached max capacity.
   */
  addTrack(track: QueuedTrack): boolean {
    if (this._tracks.length >= this.options.maxQueueSize) {
      return false;
    }
    this._tracks.push(track);
    this.emit('trackAdded', track);
    return true;
  }

  /**
   * Adds multiple tracks (e.g. from a playlist) up to max queue capacity.
   * Returns the count of tracks successfully added.
   */
  addTracks(tracks: QueuedTrack[]): number {
    const availableSpace = this.options.maxQueueSize - this._tracks.length;
    if (availableSpace <= 0) return 0;

    const toAdd = tracks.slice(0, availableSpace);
    this._tracks.push(...toAdd);
    this.emit('tracksAdded', toAdd);
    return toAdd.length;
  }

  /**
   * Removes a track by 0-based index. Returns the removed track or null if index is invalid.
   */
  removeTrack(index: number): QueuedTrack | null {
    if (index < 0 || index >= this._tracks.length) {
      return null;
    }
    const [removed] = this._tracks.splice(index, 1);
    if (removed) {
      this.emit('trackRemoved', removed, index);
      return removed;
    }
    return null;
  }

  /**
   * Moves a track from one index to another in the queue.
   */
  moveTrack(fromIndex: number, toIndex: number): boolean {
    if (
      fromIndex < 0 ||
      fromIndex >= this._tracks.length ||
      toIndex < 0 ||
      toIndex >= this._tracks.length ||
      fromIndex === toIndex
    ) {
      return false;
    }

    const [track] = this._tracks.splice(fromIndex, 1);
    if (!track) return false;
    this._tracks.splice(toIndex, 0, track);
    return true;
  }

  /**
   * Clears upcoming tracks in the queue without touching current playing track or history.
   */
  clear(): void {
    this._tracks = [];
    this.emit('queueCleared');
  }

  /**
   * Shuffles upcoming tracks using the Fisher-Yates algorithm.
   */
  shuffle(): void {
    if (this._tracks.length <= 1) return;

    for (let i = this._tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = this._tracks[i]!;
      this._tracks[i] = this._tracks[j]!;
      this._tracks[j] = temp;
    }

    this.emit('queueShuffled', this._tracks.length);
  }

  // --- Playback Controls ---

  /**
   * Starts playback of the queue if currently idle or has no current track.
   */
  start(): QueuedTrack | null {
    if (this._currentTrack) {
      return this._currentTrack;
    }

    if (this._tracks.length === 0) {
      this.setState('IDLE');
      return null;
    }

    this._currentTrack = this._tracks.shift()!;
    this._playbackPositionSeconds = 0;
    this.setState('PLAYING');
    this.emit('trackStart', this._currentTrack);
    return this._currentTrack;
  }

  /**
   * Advances to the next track on demand (e.g. /skip command).
   * Note: A manual skip intentionally bypasses single-track loop mode so users are not trapped.
   */
  skip(): QueuedTrack | null {
    if (this._currentTrack) {
      this.emit('trackEnd', this._currentTrack, 'skipped');

      if (this._loopMode === 'QUEUE') {
        this._tracks.push(this._currentTrack);
      } else {
        this.pushHistory(this._currentTrack);
      }
    }

    if (this._tracks.length > 0) {
      this._currentTrack = this._tracks.shift()!;
      this._playbackPositionSeconds = 0;
      this.setState('PLAYING');
      this.emit('trackStart', this._currentTrack);
      return this._currentTrack;
    }

    this._currentTrack = null;
    this.setState('IDLE');
    this.emit('queueEnd');
    return null;
  }

  /**
   * Called when the audio player naturally finishes playing the current track.
   * Handles loop modes and autoplay recommendation when queue is exhausted.
   */
  async onTrackFinished(reason = 'finished'): Promise<QueuedTrack | null> {
    const previousTrack = this._currentTrack;
    if (previousTrack) {
      this.emit('trackEnd', previousTrack, reason);

      if (this._loopMode === 'TRACK') {
        // Repeat current track
        this._playbackPositionSeconds = 0;
        this.setState('PLAYING');
        this.emit('trackStart', previousTrack);
        return previousTrack;
      }

      if (this._loopMode === 'QUEUE') {
        this._tracks.push(previousTrack);
      } else {
        this.pushHistory(previousTrack);
      }
    }

    if (this._tracks.length > 0) {
      this._currentTrack = this._tracks.shift()!;
      this._playbackPositionSeconds = 0;
      this.setState('PLAYING');
      this.emit('trackStart', this._currentTrack);
      return this._currentTrack;
    }

    // Queue is empty: check if Autoplay should suggest the next song
    if (this._autoplay && this._autoplayEngine && previousTrack) {
      try {
        const recommendation = await this._autoplayEngine.getRecommendation(
          previousTrack,
          this._history,
          this._tracks
        );
        if (recommendation) {
          this._currentTrack = recommendation;
          this._playbackPositionSeconds = 0;
          this.setState('PLAYING');
          this.emit('trackStart', this._currentTrack);
          return this._currentTrack;
        }
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }

    this._currentTrack = null;
    this.setState('IDLE');
    this.emit('queueEnd');
    return null;
  }

  /**
   * Replays the previous track from history (/back command).
   */
  previous(): QueuedTrack | null {
    if (this._history.length === 0) {
      return null;
    }

    const prevTrack = this._history.pop()!;
    if (this._currentTrack) {
      // Put currently playing track back at the beginning of the queue
      this._tracks.unshift(this._currentTrack);
    }

    this._currentTrack = prevTrack;
    this._playbackPositionSeconds = 0;
    this.setState('PLAYING');
    this.emit('trackStart', this._currentTrack);
    return this._currentTrack;
  }

  /**
   * Sets playback seek position in seconds.
   */
  seek(positionSeconds: number): void {
    const maxDuration = this._currentTrack?.durationSeconds ?? 0;
    const clamped = Math.max(0, Math.min(maxDuration, positionSeconds));
    this._playbackPositionSeconds = clamped;
  }

  // --- Volume & Filters ---

  /**
   * Sets volume clamped strictly between 0% and 150%.
   */
  setVolume(volume: number): number {
    const clamped = clampVolume(volume);
    if (this._volume !== clamped) {
      const oldVolume = this._volume;
      this._volume = clamped;
      this.emit('volumeChange', oldVolume, clamped);
    }
    return this._volume;
  }

  /**
   * Sets the loop mode ('OFF' | 'TRACK' | 'QUEUE').
   */
  setLoopMode(mode: LoopMode): void {
    if (this._loopMode !== mode) {
      const oldMode = this._loopMode;
      this._loopMode = mode;
      this.emit('loopChange', oldMode, mode);
    }
  }

  /**
   * Toggles an audio filter on or off.
   */
  toggleFilter(filter: AudioFilterName): boolean {
    if (filter === 'normal') {
      this.clearFilters();
      return false;
    }

    if (!isValidFilter(filter)) {
      return false;
    }

    let isActive: boolean;
    if (this._activeFilters.has(filter)) {
      this._activeFilters.delete(filter);
      isActive = false;
    } else {
      this._activeFilters.add(filter);
      isActive = true;
    }

    this.emitFilterChange();
    return isActive;
  }

  /**
   * Explicitly enables or disables an audio filter.
   */
  setFilter(filter: AudioFilterName, enabled: boolean): void {
    if (filter === 'normal') {
      if (enabled) this.clearFilters();
      return;
    }

    if (!isValidFilter(filter)) return;

    if (enabled) {
      this._activeFilters.add(filter);
    } else {
      this._activeFilters.delete(filter);
    }

    this.emitFilterChange();
  }

  /**
   * Clears all active audio filters.
   */
  clearFilters(): void {
    if (this._activeFilters.size > 0) {
      this._activeFilters.clear();
      this.emitFilterChange();
    }
  }

  /**
   * Returns the FFmpeg audio filter argument array (e.g. `['-af', '...']`).
   */
  getFFmpegFilterArgs(): string[] {
    return buildFilterArgs(this._activeFilters);
  }

  // --- Cleanup ---

  /**
   * Destroys queue state and clears all active tracks and listeners.
   */
  destroy(): void {
    this.setState('DESTROYED');
    this._tracks = [];
    this._history = [];
    this._currentTrack = null;
    this._activeFilters.clear();
    this.removeAllListeners();
  }

  // --- Internal Helpers ---

  private pushHistory(track: QueuedTrack): void {
    this._history.push(track);
    if (this._history.length > this.options.maxHistorySize) {
      this._history.shift();
    }
  }

  private emitFilterChange(): void {
    const active = Array.from(this._activeFilters);
    const args = buildFilterArgs(this._activeFilters);
    this.emit('filterChange', active, args);
  }

  // Typed EventEmitter overrides
  override on<E extends keyof QueueEvents>(event: E, listener: QueueEvents[E]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override once<E extends keyof QueueEvents>(event: E, listener: QueueEvents[E]): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  override emit<E extends keyof QueueEvents>(event: E, ...args: Parameters<QueueEvents[E]>): boolean {
    return super.emit(event, ...args);
  }
}
