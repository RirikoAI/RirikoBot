import { Readable } from 'node:stream';
import type {
  MusicSourceAdapter,
  MusicSearchResult,
  ResolvedTrack,
  ResolvedPlaylist,
  AdapterHealth,
} from '../types.js';

/**
 * Deezer Audio Extractor Adapter.
 * Supports tracks, albums, and playlists from Deezer using public REST API.
 */
export class DeezerAdapter implements MusicSourceAdapter {
  readonly id = 'deezer' as const;
  readonly name = 'Deezer Audio Extractor';
  readonly priority = 40;

  private static readonly DEEZER_URL_REGEX =
    /^(?:https?:\/\/)?(?:www\.)?(?:deezer\.com\/(?:\w{2}\/)?(track|album|playlist)\/(\d+)|deezer\.page\.link\/[a-zA-Z0-9]+)/;

  canResolve(input: string): boolean {
    if (!input || typeof input !== 'string') return false;
    return DeezerAdapter.DEEZER_URL_REGEX.test(input.trim());
  }

  parseUrl(url: string): { type: 'track' | 'album' | 'playlist'; id: string } | null {
    const match = url.trim().match(/(track|album|playlist)\/(\d+)/);
    if (match && match[1] && match[2]) {
      return { type: match[1] as 'track' | 'album' | 'playlist', id: match[2] };
    }
    return null;
  }

  async search(query: string, limit = 5): Promise<MusicSearchResult[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const count = Math.min(Math.max(1, limit), 20);
    try {
      const res = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(cleanQuery)}&limit=${count}`,
      );
      if (!res.ok) return [];

      const data = (await res.json()) as any;
      if (!data || !data.data || !Array.isArray(data.data)) return [];

      return data.data.map((item: any) => ({
        id: String(item.id),
        title: item.title || cleanQuery,
        artist: item.artist?.name || 'Deezer Artist',
        durationSeconds: item.duration || 0,
        url: item.link || `https://www.deezer.com/track/${item.id}`,
        thumbnailUrl: item.album?.cover_medium || item.album?.cover_big,
        source: 'deezer',
      }));
    } catch {
      return [];
    }
  }

  async resolve(input: string): Promise<ResolvedTrack | ResolvedPlaylist> {
    const parsed = this.parseUrl(input);
    if (!parsed) {
      throw new Error(`Invalid or unsupported Deezer URL: "${input}"`);
    }

    const { type, id } = parsed;

    if (type === 'track') {
      const res = await fetch(`https://api.deezer.com/track/${id}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch Deezer track ${id}: HTTP ${res.status}`);
      }
      const data = (await res.json()) as any;
      if (data && data.error) {
        throw new Error(`Deezer API error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      const title = data.title || `Deezer Track [${id}]`;
      const artist = data.artist?.name || 'Deezer Artist';
      const durationSeconds = data.duration || 0;
      const previewUrl = data.preview;
      const thumbnailUrl = data.album?.cover_big || data.album?.cover_medium;

      return {
        id: `dz_${id}`,
        title,
        artist,
        durationSeconds,
        url: data.link || input,
        thumbnailUrl,
        source: 'deezer',
        streamUrl: previewUrl,
        getStream: async () => {
          if (previewUrl) {
            const audioRes = await fetch(previewUrl);
            if (audioRes.ok && audioRes.body) {
              return Readable.fromWeb(audioRes.body as any);
            }
          }
          throw new Error(
            `No direct stream available for Deezer track "${title}". Must be bridged to SoundCloud.`,
          );
        },
      };
    }

    if (type === 'album' || type === 'playlist') {
      const res = await fetch(`https://api.deezer.com/${type}/${id}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch Deezer ${type} ${id}: HTTP ${res.status}`);
      }
      const data = (await res.json()) as any;
      if (data && data.error) {
        throw new Error(`Deezer API error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      const collectionTitle =
        data.title || `Deezer ${type === 'album' ? 'Album' : 'Playlist'} [${id}]`;
      const coverUrl =
        data.cover_big || data.picture_big || data.cover_medium || data.picture_medium;
      const rawTracks: any[] = data.tracks?.data || [];

      const tracks: ResolvedTrack[] = rawTracks.map((t: any) => ({
        id: `dz_${t.id}`,
        title: t.title || 'Deezer Track',
        artist: t.artist?.name || data.artist?.name || 'Deezer Artist',
        durationSeconds: t.duration || 0,
        url: t.link || `https://www.deezer.com/track/${t.id}`,
        thumbnailUrl: coverUrl,
        source: 'deezer',
        streamUrl: t.preview,
        getStream: async () => {
          if (t.preview) {
            const audioRes = await fetch(t.preview);
            if (audioRes.ok && audioRes.body) {
              return Readable.fromWeb(audioRes.body as any);
            }
          }
          throw new Error(
            `No direct stream available for Deezer track "${t.title}". Must be bridged to SoundCloud.`,
          );
        },
      }));

      return {
        title: collectionTitle,
        url: input,
        thumbnailUrl: coverUrl,
        trackCount: tracks.length,
        tracks,
        source: 'deezer',
      };
    }

    throw new Error(`Unsupported Deezer URL type: "${type}"`);
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      const res = await fetch('https://api.deezer.com/infos');
      const isHealthy = res.ok;
      return {
        source: 'deezer',
        isHealthy,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        source: 'deezer',
        isHealthy: false,
        latencyMs: Date.now() - start,
        errorMessage: (err as Error).message,
      };
    }
  }
}
