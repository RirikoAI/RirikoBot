import type { DiscordGatewayAdapterCreator } from '@discordjs/voice';
import type { QueuedTrack, TrackRequester } from '../queue/types.js';
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
