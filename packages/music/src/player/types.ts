import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type {
  AudioFilterName,
  LoopMode,
  QueueState,
  QueuedTrack,
  TrackRequester,
} from '../queue/types.js';
import type { ResolvedPlaylist } from '../types.js';

export interface PlayOptions {
  guildId: string;
  voiceChannelId: string;
  textChannelId?: string | undefined;
  member: TrackRequester;
  query: string;
  adapterCreator: DiscordGatewayAdapterCreator;
}

export interface PlayResult {
  type: 'TRACK' | 'PLAYLIST';
  track?: QueuedTrack | undefined;
  playlist?: ResolvedPlaylist | undefined;
  tracksAdded: number;
  position: number; // 0 = now playing immediately, >0 = position in upcoming queue
}

export interface MusicPlayerEvents {
  trackStart: (guildId: string, track: QueuedTrack) => void;
  trackEnd: (guildId: string, track: QueuedTrack, reason?: string) => void;
  queueEnd: (guildId: string) => void;
  stateChange: (guildId: string, oldState: QueueState, newState: QueueState) => void;
  volumeChange: (guildId: string, oldVolume: number, newVolume: number) => void;
  filterChange: (guildId: string, activeFilters: AudioFilterName[], ffmpegArgs: string[]) => void;
  loopChange: (guildId: string, oldMode: LoopMode, newMode: LoopMode) => void;
  trackAdded: (guildId: string, track: QueuedTrack) => void;
  tracksAdded: (guildId: string, tracks: QueuedTrack[]) => void;
  queueCleared: (guildId: string) => void;
  queueShuffled: (guildId: string, count: number) => void;
  error: (guildId: string, error: Error, track?: QueuedTrack) => void;
}
