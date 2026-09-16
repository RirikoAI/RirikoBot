import { Readable } from 'node:stream';
import spotifyUrlInfo, { type SpotifyUrlInfo } from 'spotify-url-info';
import type {
  MusicSourceAdapter,
  MusicSearchResult,
  ResolvedTrack,
  ResolvedPlaylist,
  AdapterHealth,
} from '../types.js';

import play from 'play-dl';

export interface SpotifyAdapterOptions {
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  refreshToken?: string | undefined;
  cookieDc?: string | undefined;
  cookieKey?: string | undefined;
}

export type SpotifyResourceType = 'track' | 'album' | 'playlist';

export interface ParsedSpotifyUrl {
  type: SpotifyResourceType;
  id: string;
}

/**
 * Spotify Metadata Extractor Adapter.
 * Resolves tracks, albums, and playlists into structured metadata using spotify-url-info
 * with user session cookie spoofing (sp_dc) and optional play-dl Spotify token integration.
 */
export class SpotifyAdapter implements MusicSourceAdapter {
  readonly id = 'spotify' as const;
  readonly name = 'Spotify Metadata Resolver';
  readonly priority = 20;

  private static readonly SPOTIFY_URL_REGEX =
    /^(?:https?:\/\/)?(?:open\.)?spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;

  private static readonly SPOTIFY_URI_REGEX = /^spotify:(track|album|playlist):([a-zA-Z0-9]+)/;

  private readonly spotifyInfo: SpotifyUrlInfo;

  constructor(options: SpotifyAdapterOptions = {}) {
    const dcCookie = options.cookieDc || process.env.SPOTIFY_DC || process.env.SP_DC;
    const keyCookie = options.cookieKey || process.env.SPOTIFY_KEY;
    const cookieHeader = [
      dcCookie ? `sp_dc=${dcCookie}` : '',
      keyCookie ? `sp_key=${keyCookie}` : '',
    ]
      .filter(Boolean)
      .join('; ');

    // Spoofed fetch honoring user session cookies
    const spoofedFetch: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      if (cookieHeader) {
        headers.set('Cookie', cookieHeader);
      }
      headers.set(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      );
      headers.set('Accept-Language', 'en-US,en;q=0.9');
      return fetch(input, { ...init, headers });
    };

    const init = spotifyUrlInfo as unknown as (f: typeof fetch) => SpotifyUrlInfo;
    this.spotifyInfo = init(spoofedFetch);

    // If Spotify Developer API credentials are provided, register with play-dl
    const clientId = options.clientId || process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = options.clientSecret || process.env.SPOTIFY_CLIENT_SECRET;
    const refreshToken = options.refreshToken || process.env.SPOTIFY_REFRESH_TOKEN;

    if (clientId && clientSecret && refreshToken) {
      void play
        .setToken({
          spotify: {
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            market: 'US',
          },
        })
        .catch((err) => {
          console.warn('[SpotifyAdapter] Failed to register Spotify token with play-dl:', err);
        });
    }
  }

  canResolve(input: string): boolean {
    if (!input || typeof input !== 'string') return false;
    const clean = input.trim();
    return SpotifyAdapter.SPOTIFY_URL_REGEX.test(clean) || SpotifyAdapter.SPOTIFY_URI_REGEX.test(clean);
  }

  parseUrl(input: string): ParsedSpotifyUrl | null {
    const clean = input.trim();
    const urlMatch = clean.match(SpotifyAdapter.SPOTIFY_URL_REGEX);
    if (urlMatch && urlMatch[1] && urlMatch[2]) {
      return { type: urlMatch[1] as SpotifyResourceType, id: urlMatch[2] };
    }

    const uriMatch = clean.match(SpotifyAdapter.SPOTIFY_URI_REGEX);
    if (uriMatch && uriMatch[1] && uriMatch[2]) {
      return { type: uriMatch[1] as SpotifyResourceType, id: uriMatch[2] };
    }

    return null;
  }

  async search(query: string, limit = 5): Promise<MusicSearchResult[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    // 1. If play-dl has Spotify credentials, use official Spotify search
    if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
      try {
        const spResults = await play.search(cleanQuery, {
          source: { spotify: 'track' },
          limit,
        });
        if (spResults && spResults.length > 0) {
          return spResults.map((r: any) => ({
            id: r.id || cleanQuery,
            title: r.name || r.title || cleanQuery,
            artist: r.artists?.[0]?.name || r.artist || 'Spotify Artist',
            durationSeconds: Math.round((r.durationInSec || r.duration || 180000) / 1000),
            url: r.url || `https://open.spotify.com/track/${r.id}`,
            thumbnailUrl: r.thumbnail?.url,
            source: 'spotify',
          }));
        }
      } catch {
        // Fall through to metadata fallback
      }
    }

    // 2. Discover track metadata from public music registry and format as Spotify track
    try {
      const res = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(cleanQuery)}&limit=${limit}`,
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        const tracks = data?.data || [];
        if (tracks.length > 0) {
          return tracks.map((t: any) => ({
            id: `sp_meta_${t.id}`,
            title: t.title,
            artist: t.artist?.name || 'Artist',
            durationSeconds: t.duration || 180,
            url: `https://open.spotify.com/track/${t.id}`,
            thumbnailUrl: t.album?.cover_big || t.album?.cover_medium,
            source: 'spotify',
          }));
        }
      }
    } catch {
      // Ignore search error
    }

    return [];
  }

  async resolve(input: string): Promise<ResolvedTrack | ResolvedPlaylist> {
    const parsed = this.parseUrl(input);
    if (!parsed) {
      throw new Error(`Invalid or unsupported Spotify URL: "${input}"`);
    }

    const cleanUrl = input.startsWith('spotify:')
      ? `https://open.spotify.com/${parsed.type}/${parsed.id}`
      : input.trim();

    const data: any = await this.spotifyInfo.getData(cleanUrl);
    const coverUrl =
      data?.coverArt?.sources?.[0]?.url ||
      data?.images?.[0]?.url ||
      'https://open.spotify.com/favicon.ico';

    if (parsed.type === 'track') {
      const artist =
        data?.artist ||
        data?.artists?.map((a: any) => a.name).join(', ') ||
        'Spotify Artist';
      const title = data?.name || data?.title || `Spotify Track [${parsed.id}]`;
      const durationSeconds = Math.round((data?.duration || data?.duration_ms || 180000) / 1000);
      const previewUrl = data?.previewUrl || data?.preview_url || undefined;

      return {
        id: parsed.id,
        title,
        artist,
        durationSeconds,
        url: cleanUrl,
        thumbnailUrl: coverUrl,
        source: 'spotify',
        streamUrl: previewUrl,
        getStream: async () => {
          if (previewUrl) {
            const res = await fetch(previewUrl);
            if (res.ok && res.body) {
              return Readable.fromWeb(res.body as any);
            }
          }
          throw new Error(`Direct audio stream not available for Spotify track "${title}". Must be bridged to SoundCloud/YouTube.`);
        },
      };
    }

    // Playlist or Album
    const rawTracks: any[] = await this.spotifyInfo.getTracks(cleanUrl);
    const tracks: ResolvedTrack[] = rawTracks.map((t: any, idx: number) => {
      const trackId = t.id || `${parsed.id}_${idx + 1}`;
      const artist =
        t.artist ||
        t.artists?.map((a: any) => a.name).join(', ') ||
        'Various Artists';
      const title = t.name || t.title || `Track #${idx + 1}`;
      const durationSeconds = Math.round((t.duration || t.duration_ms || 180000) / 1000);
      const previewUrl = t.previewUrl || t.preview_url || undefined;

      return {
        id: trackId,
        title,
        artist,
        durationSeconds,
        url: t.uri ? `https://open.spotify.com/track/${trackId}` : cleanUrl,
        thumbnailUrl: coverUrl,
        source: 'spotify',
        streamUrl: previewUrl,
        getStream: async () => {
          if (previewUrl) {
            const res = await fetch(previewUrl);
            if (res.ok && res.body) {
              return Readable.fromWeb(res.body as any);
            }
          }
          throw new Error(`Direct audio stream not available for Spotify track "${title}". Must be bridged to SoundCloud/YouTube.`);
        },
      };
    });

    const collectionTitle = data?.name || data?.title || `Spotify ${parsed.type === 'album' ? 'Album' : 'Playlist'}`;

    return {
      title: collectionTitle,
      url: cleanUrl,
      thumbnailUrl: coverUrl,
      trackCount: tracks.length,
      tracks,
      source: 'spotify',
    };
  }

  async healthCheck(): Promise<AdapterHealth> {
    const start = Date.now();
    try {
      const testUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
      const data: any = await this.spotifyInfo.getData(testUrl);
      const isHealthy = Boolean(data && (data.name || data.title));
      return {
        source: 'spotify',
        isHealthy,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        source: 'spotify',
        isHealthy: false,
        latencyMs: Date.now() - start,
        errorMessage: (err as Error).message,
      };
    }
  }
}
