import type { Readable } from 'node:stream';

export type MusicSource = 'youtube' | 'spotify' | 'soundcloud' | 'deezer' | 'direct';

export interface MusicSearchResult {
  id: string;
  title: string;
  artist: string;
  durationSeconds: number;
  url: string;
  thumbnailUrl?: string | undefined;
  source: MusicSource;
}

export type AudioStreamGetter = () => Promise<Readable | NodeJS.ReadableStream>;

export interface ResolvedTrack extends MusicSearchResult {
  streamUrl?: string | undefined;
  getStream: AudioStreamGetter;
  isLive?: boolean | undefined;
}

export interface ResolvedPlaylist {
  title: string;
  url: string;
  thumbnailUrl?: string | undefined;
  trackCount: number;
  tracks: ResolvedTrack[];
  source: MusicSource;
}

export interface AdapterHealth {
  source: MusicSource;
  isHealthy: boolean;
  latencyMs: number;
  errorMessage?: string | undefined;
}

export interface MusicSourceAdapter {
  readonly id: MusicSource;
  readonly name: string;
  readonly priority: number;

  canResolve(input: string): boolean;
  search(query: string, limit?: number): Promise<MusicSearchResult[]>;
  resolve(input: string): Promise<ResolvedTrack | ResolvedPlaylist>;
  healthCheck(): Promise<AdapterHealth>;
}

export interface ExtractorPipelineOptions {
  adapters?: MusicSourceAdapter[] | undefined;
  defaultSearchSource?: MusicSource | undefined;
  searchLimit?: number | undefined;
  youtubeOptions?: {
    cookie?: string | undefined;
    cookies?: string[] | undefined;
    poToken?: string | undefined;
    visitorData?: string | undefined;
    clientType?: string | undefined;
    requestTimeoutMs?: number | undefined;
  } | undefined;
}
