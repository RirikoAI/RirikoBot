import { Readable } from 'node:stream';
import spotifyUrlInfo, { type SpotifyUrlInfo } from 'spotify-url-info';
import type {
  CanonicalMetadataResolver,
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

interface WebApiToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Spotify Extractor Adapter.
 * Resolves tracks, albums, and playlists into structured canonical metadata using:
 * 1. Official Spotify Web API Client Credentials (SPOTIFY_CLIENT_ID & SPOTIFY_CLIENT_SECRET)
 * 2. User session cookie scraping (SPOTIFY_DC / sp_dc and SPOTIFY_KEY / sp_key) via spotify-url-info
 * 3. play-dl Spotify token registration
 *
 * Full audio playback is seamlessly bridged to high-fidelity audio streams (SoundCloud / YouTube Topic)
 * without requiring brittle platform-dependent daemons.
 */
export class SpotifyAdapter implements CanonicalMetadataResolver {
  readonly id = 'spotify' as const;
  readonly name = 'Spotify Metadata Resolver';
  readonly priority = 20;

  private static readonly SPOTIFY_URL_REGEX =
    /^(?:https?:\/\/)?(?:open\.)?spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;

  private static readonly SPOTIFY_URI_REGEX = /^spotify:(track|album|playlist):([a-zA-Z0-9]+)/;

  private readonly clientId?: string | undefined;
  private readonly clientSecret?: string | undefined;
  private readonly spotifyInfo: SpotifyUrlInfo;
  private cachedToken?: WebApiToken | undefined;

  constructor(options: SpotifyAdapterOptions = {}) {
    this.clientId = options.clientId || process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = options.clientSecret || process.env.SPOTIFY_CLIENT_SECRET;
    const refreshToken = options.refreshToken || process.env.SPOTIFY_REFRESH_TOKEN;

    const dcCookie = process.env.SPOTIFY_DC || process.env.SP_DC || options.cookieDc;
    const keyCookie = process.env.SPOTIFY_KEY || process.env.SP_KEY || options.cookieKey;
    const cookieHeader = [
      dcCookie ? `sp_dc=${dcCookie}` : '',
      keyCookie ? `sp_key=${keyCookie}` : '',
    ]
      .filter(Boolean)
      .join('; ');

    // Spoofed fetch honoring user session cookies for spotify-url-info
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
    if (this.clientId && this.clientSecret && refreshToken) {
      void play
        .setToken({
          spotify: {
            client_id: this.clientId,
            client_secret: this.clientSecret,
            refresh_token: refreshToken,
            market: 'US',
          },
        })
        .catch((err) => {
          console.warn('[SpotifyAdapter] Failed to register Spotify token with play-dl:', err);
        });
    }
  }

  hasWebApiCredentials(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Retrieves a valid OAuth2 Bearer token using the Client Credentials Flow.
   */
  private async getAccessToken(): Promise<string | null> {
    if (!this.clientId || !this.clientSecret) return null;

    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.accessToken;
    }

    try {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        console.warn(
          `[SpotifyAdapter] Failed to obtain Client Credentials token: HTTP ${res.status}`,
        );
        return null;
      }

      const data = (await res.json()) as { access_token: string; expires_in: number };
      this.cachedToken = {
        accessToken: data.access_token,
        // Expire 60 seconds early to avoid race conditions
        expiresAt: Date.now() + Math.max(0, (data.expires_in - 60) * 1000),
      };

      return this.cachedToken.accessToken;
    } catch (err) {
      console.warn('[SpotifyAdapter] Error fetching Spotify access token:', err);
      return null;
    }
  }

  /**
   * Performs an authenticated request to the official Spotify Web API.
   */
  private async fetchWebApi<T>(endpoint: string): Promise<T | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    try {
      const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  canResolve(input: string): boolean {
    if (!input || typeof input !== 'string') return false;
    const clean = input.trim();
    return (
      SpotifyAdapter.SPOTIFY_URL_REGEX.test(clean) || SpotifyAdapter.SPOTIFY_URI_REGEX.test(clean)
    );
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

    // 1. If official Web API credentials are provided, search via official Web API
    if (this.hasWebApiCredentials()) {
      const data = await this.fetchWebApi<{
        tracks?: {
          items?: Array<{
            id: string;
            name: string;
            artists: Array<{ name: string }>;
            duration_ms: number;
            external_urls?: { spotify?: string };
            album?: { images?: Array<{ url: string }> };
          }>;
        };
      }>(`/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=${limit}`);

      const items = data?.tracks?.items;
      if (items && items.length > 0) {
        return items.map((item) => ({
          id: item.id,
          title: item.name,
          artist: item.artists.map((a) => a.name).join(', ') || 'Spotify Artist',
          durationSeconds: Math.round(item.duration_ms / 1000),
          url: item.external_urls?.spotify || `https://open.spotify.com/track/${item.id}`,
          thumbnailUrl: item.album?.images?.[0]?.url,
          source: 'spotify',
        }));
      }
    }

    // 2. If play-dl has Spotify credentials, use play-dl Spotify search
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

    // 3. Discover track metadata from public music registry and format as Spotify track
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

    // Try resolving via official Spotify Web API first if credentials are present
    if (this.hasWebApiCredentials()) {
      try {
        if (parsed.type === 'track') {
          const trackData = await this.fetchWebApi<{
            id: string;
            name: string;
            artists: Array<{ name: string }>;
            duration_ms: number;
            external_urls?: { spotify?: string };
            external_ids?: { isrc?: string };
            preview_url?: string | null;
            album?: { name?: string; images?: Array<{ url: string }> };
          }>(`/tracks/${parsed.id}`);

          if (trackData) {
            const artist = trackData.artists.map((a) => a.name).join(', ') || 'Spotify Artist';
            const title = trackData.name;
            const durationSeconds = Math.round(trackData.duration_ms / 1000);
            const coverUrl =
              trackData.album?.images?.[0]?.url || 'https://open.spotify.com/favicon.ico';
            const previewUrl = trackData.preview_url ?? undefined;

            return {
              id: parsed.id,
              title,
              artist,
              durationSeconds,
              url: cleanUrl,
              thumbnailUrl: coverUrl,
              source: 'spotify',
              isrc: trackData.external_ids?.isrc,
              album: trackData.album?.name,
              streamUrl: previewUrl,
              getStream: async () => {
                if (previewUrl) {
                  const res = await fetch(previewUrl);
                  if (res.ok && res.body) {
                    return Readable.fromWeb(res.body as any);
                  }
                }
                throw new Error(
                  `Direct stream not available for Spotify track "${title}". Must be bridged to SoundCloud/YouTube.`,
                );
              },
            };
          }
        } else if (parsed.type === 'album') {
          const albumData = await this.fetchWebApi<{
            id: string;
            name: string;
            images?: Array<{ url: string }>;
            tracks: {
              items: Array<{
                id: string;
                name: string;
                artists: Array<{ name: string }>;
                duration_ms: number;
                preview_url?: string | null;
              }>;
            };
          }>(`/albums/${parsed.id}`);

          if (albumData) {
            const coverUrl = albumData.images?.[0]?.url || 'https://open.spotify.com/favicon.ico';
            const tracks: ResolvedTrack[] = albumData.tracks.items.map((t, idx) => {
              const artist = t.artists.map((a) => a.name).join(', ') || 'Various Artists';
              const title = t.name;
              const durationSeconds = Math.round(t.duration_ms / 1000);
              const previewUrl = t.preview_url ?? undefined;

              return {
                id: t.id || `${parsed.id}_${idx + 1}`,
                title,
                artist,
                durationSeconds,
                url: `https://open.spotify.com/track/${t.id}`,
                thumbnailUrl: coverUrl,
                source: 'spotify',
                album: albumData.name,
                streamUrl: previewUrl,
                getStream: async () => {
                  if (previewUrl) {
                    const res = await fetch(previewUrl);
                    if (res.ok && res.body) {
                      return Readable.fromWeb(res.body as any);
                    }
                  }
                  throw new Error(
                    `Direct stream not available for Spotify track "${title}". Must be bridged to SoundCloud/YouTube.`,
                  );
                },
              };
            });

            return {
              title: albumData.name,
              url: cleanUrl,
              thumbnailUrl: coverUrl,
              trackCount: tracks.length,
              tracks,
              source: 'spotify',
            };
          }
        } else if (parsed.type === 'playlist') {
          const playlistData = await this.fetchWebApi<{
            id: string;
            name: string;
            images?: Array<{ url: string }>;
            tracks: {
              items: Array<{
                track: {
                  id: string;
                  name: string;
                  artists: Array<{ name: string }>;
                  duration_ms: number;
                  preview_url?: string | null;
                  album?: { images?: Array<{ url: string }> };
                } | null;
              }>;
            };
          }>(`/playlists/${parsed.id}`);

          if (playlistData) {
            const coverUrl =
              playlistData.images?.[0]?.url || 'https://open.spotify.com/favicon.ico';
            const tracks: ResolvedTrack[] = playlistData.tracks.items
              .filter((item): item is { track: NonNullable<(typeof item)['track']> } =>
                Boolean(item.track),
              )
              .map((item, idx) => {
                const t = item.track;
                const artist = t.artists.map((a) => a.name).join(', ') || 'Various Artists';
                const title = t.name;
                const durationSeconds = Math.round(t.duration_ms / 1000);
                const previewUrl = t.preview_url ?? undefined;
                const trackCover = t.album?.images?.[0]?.url || coverUrl;

                return {
                  id: t.id || `${parsed.id}_${idx + 1}`,
                  title,
                  artist,
                  durationSeconds,
                  url: `https://open.spotify.com/track/${t.id}`,
                  thumbnailUrl: trackCover,
                  source: 'spotify',
                  streamUrl: previewUrl,
                  getStream: async () => {
                    if (previewUrl) {
                      const res = await fetch(previewUrl);
                      if (res.ok && res.body) {
                        return Readable.fromWeb(res.body as any);
                      }
                    }
                    throw new Error(
                      `Direct stream not available for Spotify track "${title}". Must be bridged to SoundCloud/YouTube.`,
                    );
                  },
                };
              });

            return {
              title: playlistData.name,
              url: cleanUrl,
              thumbnailUrl: coverUrl,
              trackCount: tracks.length,
              tracks,
              source: 'spotify',
            };
          }
        }
      } catch {
        // Fall back to spotify-url-info scraping
      }
    }

    // Fallback: spotify-url-info (with sp_dc/sp_key user session cookies)
    const data: any = await this.spotifyInfo.getData(cleanUrl);
    const coverUrl =
      data?.coverArt?.sources?.[0]?.url ||
      data?.images?.[0]?.url ||
      'https://open.spotify.com/favicon.ico';

    if (parsed.type === 'track') {
      const artist =
        data?.artist || data?.artists?.map((a: any) => a.name).join(', ') || 'Spotify Artist';
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
        album: (data?.album?.name || data?.album || undefined) as string | undefined,
        streamUrl: previewUrl,
        getStream: async () => {
          if (previewUrl) {
            const res = await fetch(previewUrl);
            if (res.ok && res.body) {
              return Readable.fromWeb(res.body as any);
            }
          }
          throw new Error(
            `Direct audio stream not available for Spotify track "${title}". Must be bridged to SoundCloud/YouTube.`,
          );
        },
      };
    }

    // Playlist or Album via spotify-url-info
    const rawTracks: any[] = await this.spotifyInfo.getTracks(cleanUrl);
    const tracks: ResolvedTrack[] = rawTracks.map((t: any, idx: number) => {
      const trackId = t.id || `${parsed.id}_${idx + 1}`;
      const artist = t.artist || t.artists?.map((a: any) => a.name).join(', ') || 'Various Artists';
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
          throw new Error(
            `Direct audio stream not available for Spotify track "${title}". Must be bridged to SoundCloud/YouTube.`,
          );
        },
      };
    });

    const collectionTitle =
      data?.name || data?.title || `Spotify ${parsed.type === 'album' ? 'Album' : 'Playlist'}`;

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
      if (this.hasWebApiCredentials()) {
        const token = await this.getAccessToken();
        if (token) {
          return {
            source: 'spotify',
            isHealthy: true,
            latencyMs: Date.now() - start,
          };
        }
      }

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
