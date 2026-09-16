import { Readable } from 'node:stream';
import type {
  MusicSourceAdapter,
  MusicSearchResult,
  ResolvedTrack,
  ResolvedPlaylist,
  AdapterHealth,
} from '../types.js';

/**
 * Direct Stream / Raw Audio URL Adapter.
 * Supports direct links to .mp3, .ogg, .opus, .wav, .flac, .aac, .m4a, and .m3u8 streams.
 */
export class DirectAdapter implements MusicSourceAdapter {
  readonly id = 'direct' as const;
  readonly name = 'Direct Audio Stream Adapter';
  readonly priority = 50;

  private static readonly AUDIO_EXTENSIONS_REGEX =
    /\.(mp3|ogg|opus|wav|flac|aac|m4a|m3u8)(\?.*)?$/i;

  canResolve(input: string): boolean {
    if (!input || typeof input !== 'string') return false;
    const clean = input.trim();
    return (
      (clean.startsWith('http://') || clean.startsWith('https://')) &&
      DirectAdapter.AUDIO_EXTENSIONS_REGEX.test(clean)
    );
  }

  async search(_query: string): Promise<MusicSearchResult[]> {
    // Direct adapter does not perform keyword searches
    return [];
  }

  async resolve(input: string): Promise<ResolvedTrack | ResolvedPlaylist> {
    const clean = input.trim();
    if (!this.canResolve(clean)) {
      throw new Error(`Invalid direct audio URL: "${input}"`);
    }

    const urlObj = new URL(clean);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop() ?? 'audio_stream';
    const cleanTitle = decodeURIComponent(filename).replace(/\.[^/.]+$/, '');

    return {
      id: `direct_${Buffer.from(clean).toString('hex').slice(0, 16)}`,
      title: cleanTitle.replace(/[-_]/g, ' '),
      artist: urlObj.hostname,
      durationSeconds: 0, // 0 indicates unknown or live stream
      url: clean,
      thumbnailUrl: undefined,
      source: 'direct',
      streamUrl: clean,
      isLive: clean.includes('.m3u8'),
      getStream: async () => {
        const res = await fetch(clean);
        if (!res.ok || !res.body) {
          throw new Error(`Failed to fetch direct audio stream from ${clean}: HTTP ${res.status}`);
        }
        return Readable.fromWeb(res.body as any);
      },
    };
  }

  async healthCheck(): Promise<AdapterHealth> {
    return {
      source: 'direct',
      isHealthy: true,
      latencyMs: 5,
    };
  }
}
