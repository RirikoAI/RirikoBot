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
import { PrecisionTrackMatcher } from './track-matcher.js';

/**
 * ExtractorPipeline orchestrates multiple audio extractors.
 * Provides fallback searching, metadata mapping, and resilient stream resolution.
 */
export class ExtractorPipeline {
  private readonly adapters: Map<MusicSource, MusicSourceAdapter> = new Map();
  private readonly defaultSearchSource: MusicSource;
  private readonly defaultSearchLimit: number;

  constructor(options: ExtractorPipelineOptions = {}) {
    this.defaultSearchSource = options.defaultSearchSource ?? 'soundcloud';
    this.defaultSearchLimit = options.searchLimit ?? 5;

    if (options.adapters && options.adapters.length > 0) {
      for (const adapter of options.adapters) {
        this.registerAdapter(adapter);
      }
    } else {
      // Register all standard adapters: SoundCloud, Spotify, YouTube, Deezer, Direct
      this.registerAdapter(new SoundCloudAdapter());
      this.registerAdapter(new SpotifyAdapter());
      this.registerAdapter(new YouTubeAdapter(options.youtubeOptions as any));
      this.registerAdapter(new DeezerAdapter());
      this.registerAdapter(new DirectAdapter());
    }

    this.wireMetadataResolution();
  }

  /**
   * Spotify holds the cleanest studio metadata for a recording. It is wired into the YouTube
   * fallback cascade as Tier 5 to supply canonical artist and title queries for Tiers 6 and 7.
   */
  private wireMetadataResolution(): void {
    const youtube = this.adapters.get('youtube');
    const spotify = this.adapters.get('spotify');
    if (youtube instanceof YouTubeAdapter && spotify instanceof SpotifyAdapter) {
      youtube.setMetadataResolver(spotify);
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

  normalizeInput(input: string): string {
    if (!input || typeof input !== 'string') return '';
    let clean = input.trim();
    if (clean.startsWith('<') && clean.endsWith('>')) {
      clean = clean.slice(1, -1).trim();
    }
    return clean;
  }

  canResolve(input: string): boolean {
    const clean = this.normalizeInput(input);
    if (!clean) return false;
    for (const adapter of this.getAdapters()) {
      if (adapter.canResolve(clean)) {
        return true;
      }
    }
    return false;
  }

  findAdapterForUrl(url: string): MusicSourceAdapter | null {
    const clean = this.normalizeInput(url);
    if (!clean) return null;
    for (const adapter of this.getAdapters()) {
      if (adapter.canResolve(clean)) {
        return adapter;
      }
    }
    return null;
  }

  isUrl(input: string): boolean {
    const clean = this.normalizeInput(input);
    try {
      const url = new URL(clean);
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
    const clean = this.normalizeInput(input);
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

      // If resolved from Deezer, attach stream bridge for full-length audio
      if (adapter.id === 'deezer') {
        return this.bridgeDeezerStream(resolved);
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
    const primaryAdapter =
      this.getAdapter(topResult.source) ??
      this.getAdapter('youtube') ??
      this.getAdapter('spotify') ??
      this.getAdapter('soundcloud')!;
    const resolved = await primaryAdapter.resolve(topResult.url);

    if (topResult.source === 'spotify') {
      return this.bridgeSpotifyStream(resolved);
    }
    if (topResult.source === 'deezer') {
      return this.bridgeDeezerStream(resolved);
    }

    return resolved;
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

  /**
   * Bridges Deezer metadata tracks to playable audio streams (preferring full-length SoundCloud stream).
   */
  private bridgeDeezerStream(
    resolved: ResolvedTrack | ResolvedPlaylist,
  ): ResolvedTrack | ResolvedPlaylist {
    if ('tracks' in resolved) {
      const bridgedTracks = resolved.tracks.map((track) => this.wrapTrackStreamBridge(track));
      return {
        ...resolved,
        tracks: bridgedTracks,
      };
    }

    return this.wrapTrackStreamBridge(resolved);
  }

  private wrapTrackStreamBridge(track: ResolvedTrack): ResolvedTrack {
    return {
      ...track,
      getStream: async () => {
        // Priority 1: YouTube Music & Official Topic Audio with Precision Matching
        const ytAdapter = this.getAdapter('youtube');
        if (ytAdapter) {
          const queries = PrecisionTrackMatcher.generateSearchQueries(track);
          for (const query of queries) {
            try {
              const candidates = await ytAdapter.search(query, 5);
              const bestMatch = PrecisionTrackMatcher.selectBestCandidate(track, candidates, 0.70);
              if (bestMatch) {
                const ytTrack = (await ytAdapter.resolve(bestMatch.candidate.url)) as ResolvedTrack;
                return await ytTrack.getStream();
              }
            } catch {
              // Try next query variant
            }
          }
        }

        // Priority 2: SoundCloud Fallback with Strict Precision & Duration Guard
        // SoundCloud is ONLY accepted if it meets the exact same precision criteria (rejecting radio podcasts/mixes)
        const scAdapter = this.getAdapter('soundcloud');
        if (scAdapter) {
          const cleanTitle = PrecisionTrackMatcher.cleanTitle(track.title) || track.title;
          const scQueries = [
            `${track.artist} - ${cleanTitle}`,
            `${track.artist} ${track.title}`,
          ];
          for (const query of scQueries) {
            try {
              const scCandidates = await scAdapter.search(query, 5);
              const bestSc = PrecisionTrackMatcher.selectBestCandidate(track, scCandidates, 0.75);
              if (bestSc) {
                const scTrack = (await scAdapter.resolve(bestSc.candidate.url)) as ResolvedTrack;
                return await scTrack.getStream();
              }
            } catch {
              // Try next query
            }
          }
        }

        // Priority 3: Fallback to original track stream (e.g. preview MP3 stream if available)
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

    // Fallback chain: preferred (default SoundCloud) -> Spotify -> YouTube -> Deezer
    const rawChain: MusicSource[] = [
      preferredSource,
      'soundcloud',
      'spotify',
      'youtube',
      'deezer',
    ];
    const chain = rawChain.filter((val, idx, arr) => arr.indexOf(val) === idx);

    for (const source of chain) {
      const adapter = this.getAdapter(source);
      if (!adapter) continue;
      try {
        const results = await adapter.search(cleanQuery, limit);
        if (results && results.length > 0) {
          return results;
        }
      } catch {
        // Continue to next provider in fallback chain
      }
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

  /**
   * Generates a comprehensive health and latency diagnostic report.
   */
  async getHealthSummary(): Promise<PipelineHealthSummary> {
    const adapters = await this.healthCheck();
    const healthyCount = adapters.filter((a) => a.isHealthy).length;
    const totalCount = adapters.length;
    const totalLatency = adapters.reduce((sum, a) => sum + Math.max(0, a.latencyMs), 0);
    const averageLatencyMs = totalCount > 0 ? Math.round(totalLatency / totalCount) : 0;

    let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' = 'HEALTHY';
    if (healthyCount === 0) {
      status = 'UNHEALTHY';
    } else if (healthyCount < totalCount) {
      status = 'DEGRADED';
    }

    return {
      status,
      healthyCount,
      totalCount,
      averageLatencyMs,
      adapters,
      checkedAt: new Date(),
    };
  }
}

export interface PipelineHealthSummary {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  healthyCount: number;
  totalCount: number;
  averageLatencyMs: number;
  adapters: AdapterHealth[];
  checkedAt: Date;
}
