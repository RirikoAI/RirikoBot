import type { ResolvedTrack } from '../types.js';
export type { ResolvedTrack };

export type LoopMode = 'OFF' | 'TRACK' | 'QUEUE';

export type QueueState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'DESTROYED';

export type AudioFilterName =
  | 'bassboost'
  | 'bassboost_high'
  | 'nightcore'
  | 'vaporwave'
  | '8d'
  | 'treble'
  | 'pop'
  | 'soft'
  | 'karaoke'
  | 'normal';

export interface TrackRequester {
  id: string;
  username: string;
  avatarUrl?: string | undefined;
}

export interface QueuedTrack extends ResolvedTrack {
  requestedBy: TrackRequester;
  addedAt: Date;
}

export interface GuildQueueOptions {
  guildId: string;
  textChannelId?: string | undefined;
  voiceChannelId?: string | undefined;
  defaultVolume?: number | undefined;
  leaveOnEmpty?: boolean | undefined;
  leaveOnEnd?: boolean | undefined;
  idleTimeoutMs?: number | undefined;
  maxQueueSize?: number | undefined;
  maxHistorySize?: number | undefined;
  autoplay?: boolean | undefined;
}

export interface QueueEvents {
  trackStart: (track: QueuedTrack) => void;
  trackEnd: (track: QueuedTrack, reason?: string) => void;
  queueEnd: () => void;
  stateChange: (oldState: QueueState, newState: QueueState) => void;
  volumeChange: (oldVolume: number, newVolume: number) => void;
  filterChange: (activeFilters: AudioFilterName[], ffmpegArgs: string[]) => void;
  loopChange: (oldMode: LoopMode, newMode: LoopMode) => void;
  trackAdded: (track: QueuedTrack) => void;
  tracksAdded: (tracks: QueuedTrack[]) => void;
  trackRemoved: (track: QueuedTrack, index: number) => void;
  queueCleared: () => void;
  queueShuffled: (trackCount: number) => void;
  error: (error: Error, track?: QueuedTrack) => void;
}
