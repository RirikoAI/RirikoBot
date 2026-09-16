import type {
  MusicSourceAdapter,
  MusicSearchResult,
  ResolvedTrack,
  ResolvedPlaylist,
  AdapterHealth,
  MusicSource,
  ExtractorPipelineOptions,
} from '../types.js';
import { YouTubeAdapter } from './youtube.adapter.js';
import { SpotifyAdapter } from './spotify.adapter.js';
import { SoundCloudAdapter } from './soundcloud.adapter.js';
import { DeezerAdapter } from './deezer.adapter.js';
import { DirectAdapter } from './direct.adapter.js';

/**
 * ExtractorPipeline orchestrates multiple audio extractors.
 * Provides fallback searching, metadata mapping, and resilient stream resolution.
 */
export class ExtractorPipeline {
  private readonly adapters: Map<MusicSource, MusicSourceAdapter> = new Map();
  private readonly defaultSearchSource: MusicSource;
  private readonly defaultSearchLimit: number;

  constructor(options: ExtractorPipelineOptions = {}) {
    this.defaultSearchSource = options.defaultSearchSource ?? 'youtube';
    this.defaultSearchLimit = options.searchLimit ?? 5;

    if (options.adapters && options.adapters.length > 0) {
      for (const adapter of options.adapters) {
        this.registerAdapter(adapter);
      }
    } else {
      // Register all standard adapters in order
      this.registerAdapter(new YouTubeAdapter());
      this.registerAdapter(new SpotifyAdapter());
      this.registerAdapter(new SoundCloudAdapter());
      this.registerAdapter(new DeezerAdapter());
      this.registerAdapter(new DirectAdapter());
    }
  }

  registerAdapter(adapter: MusicSourceAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: MusicSource): MusicSourceAdapter | undefined {
    return this.adapters.get(id);
  }

  getAdapters(): MusicSourceAdapter[] {
    return Array.from(this.adapters.values()).sort((a, b) => a.priority - b.priority);
  }

  canResolve(input: string): boolean {
    if (!input || typeof input !== 'string') return false;
    for (const adapter of this.getAdapters()) {
      if (adapter.canResolve(input)) {
        return true;
      }
    }
    return false;
  }

  findAdapterForUrl(url: string): MusicSourceAdapter | null {
    for (const adapter of this.getAdapters()) {
      if (adapter.canResolve(url)) {
        return adapter;
      }
    }
    return null;
  }

  isUrl(input: string): boolean {
    try {
      const url = new URL(input.trim());
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Resolves a query or URL into a playable track or playlist.
   * If a search string is given, resolves the first result from the primary search engine.
   */
  async resolve(input: string): Promise<ResolvedTrack | ResolvedPlaylist> {
    const clean = input.trim();
    if (!clean) {
      throw new Error('Cannot resolve empty music query or URL.');
    }

    const adapter = this.findAdapterForUrl(clean);
    if (adapter) {
      const resolved = await adapter.resolve(clean);

      // If resolved from Spotify (metadata-only), attach stream bridge
      if (adapter.id === 'spotify') {
        return this.bridgeSpotifyStream(resolved);
      }

      return resolved;
    }

    // If input is an unknown URL, try direct adapter as fallback
    if (this.isUrl(clean)) {
      const direct = this.getAdapter('direct');
      if (direct && direct.canResolve(clean)) {
        return await direct.resolve(clean);
      }
      throw new Error(`No compatible music extractor found for URL: "${clean}"`);
    }

    // Input is a search query -> Search default source and resolve top result
    const searchResults = await this.search(clean, this.defaultSearchSource, 1);
    if (searchResults.length === 0) {
      throw new Error(`No music search results found for query: "${clean}"`);
    }

    const topResult = searchResults[0]!;
    const primaryAdapter = this.getAdapter(topResult.source) ?? this.getAdapter('youtube')!;
    return await primaryAdapter.resolve(topResult.url);
  }

  /**
   * Bridges Spotify metadata-only tracks to playable audio streams.
   */
  private bridgeSpotifyStream(
    resolved: ResolvedTrack | ResolvedPlaylist,
  ): ResolvedTrack | ResolvedPlaylist {
    if ('tracks' in resolved) {
      // Playlist / Album
      const bridgedTracks = resolved.tracks.map((track) => this.wrapTrackStreamBridge(track));
      return {
        ...resolved,
        tracks: bridgedTracks,
      };
    }

    // Single track
    return this.wrapTrackStreamBridge(resolved);
  }

  private wrapTrackStreamBridge(track: ResolvedTrack): ResolvedTrack {
    return {
      ...track,
      getStream: async () => {
        // Search YouTube fallback for the track
        const ytAdapter = this.getAdapter('youtube');
        if (!ytAdapter) {
          throw new Error('YouTube adapter not registered for Spotify stream fallback');
        }
        const query = `${track.artist} - ${track.title} audio`;
        const searchResults = await ytAdapter.search(query, 1);
        if (searchResults.length > 0 && searchResults[0]) {
          const ytTrack = (await ytAdapter.resolve(searchResults[0].url)) as ResolvedTrack;
          return await ytTrack.getStream();
        }
        return await track.getStream();
      },
    };
  }

  /**
   * Search for tracks across adapters with fallback support.
   */
  async search(
    query: string,
    preferredSource: MusicSource = this.defaultSearchSource,
    limit = this.defaultSearchLimit,
  ): Promise<MusicSearchResult[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const primaryAdapter = this.getAdapter(preferredSource);
    if (primaryAdapter) {
      try {
        const results = await primaryAdapter.search(cleanQuery, limit);
        if (results.length > 0) return results;
      } catch {
        // Fallback to secondary source
      }
    }

    // Fallback: SoundCloud if primary was YouTube, or YouTube if primary was not YouTube
    const fallbackSource: MusicSource = preferredSource === 'youtube' ? 'soundcloud' : 'youtube';
    const fallbackAdapter = this.getAdapter(fallbackSource);
    if (fallbackAdapter) {
      return await fallbackAdapter.search(cleanQuery, limit);
    }

    return [];
  }

  /**
   * Performs health checks on all registered adapters.
   */
  async healthCheck(): Promise<AdapterHealth[]> {
    const results: AdapterHealth[] = [];
    for (const adapter of this.getAdapters()) {
      try {
        const health = await adapter.healthCheck();
        results.push(health);
      } catch (err) {
        results.push({
          source: adapter.id,
          isHealthy: false,
          latencyMs: -1,
          errorMessage: (err as Error).message,
        });
      }
    }
    return results;
  }
}
