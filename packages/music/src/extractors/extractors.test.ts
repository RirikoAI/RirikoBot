import { describe, it, expect, beforeEach } from 'vitest';
import {
  ExtractorPipeline,
  YouTubeAdapter,
  SpotifyAdapter,
  SoundCloudAdapter,
  DeezerAdapter,
  DirectAdapter,
} from './index.js';
import type {
  CanonicalMetadataResolver,
  ResolvedTrack,
  ResolvedPlaylist,
  MusicSearchResult,
} from '../types.js';

describe('Multi-Source Music Extractors & Source Adapters (TASK-0501)', () => {
  let pipeline: ExtractorPipeline;
  let ytAdapter: YouTubeAdapter;
  let spAdapter: SpotifyAdapter;
  let scAdapter: SoundCloudAdapter;
  let dzAdapter: DeezerAdapter;
  let directAdapter: DirectAdapter;

  beforeEach(() => {
    ytAdapter = new YouTubeAdapter();
    spAdapter = new SpotifyAdapter();
    scAdapter = new SoundCloudAdapter();
    dzAdapter = new DeezerAdapter();
    directAdapter = new DirectAdapter();

    pipeline = new ExtractorPipeline({
      adapters: [ytAdapter, spAdapter, scAdapter, dzAdapter, directAdapter],
      defaultSearchSource: 'youtube',
    });
  });

  describe('1. URL Pattern Recognition & Detection', () => {
    it('recognizes standard YouTube video, shortlink, shorts, and playlist URLs', () => {
      expect(ytAdapter.canResolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(ytAdapter.canResolve('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
      expect(ytAdapter.canResolve('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true);
      expect(ytAdapter.canResolve('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
      expect(
        ytAdapter.canResolve('https://www.youtube.com/playlist?list=PLrAlnnR2v3e96s61f2w_h_bE2L9'),
      ).toBe(true);
      expect(ytAdapter.canResolve('https://google.com')).toBe(false);
    });

    it('recognizes Spotify track, album, playlist URLs and URIs', () => {
      expect(spAdapter.canResolve('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(
        true,
      );
      expect(spAdapter.canResolve('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3')).toBe(
        true,
      );
      expect(spAdapter.canResolve('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe(
        true,
      );
      expect(spAdapter.canResolve('spotify:track:4cOdK2wGLETKBW3PvgPWqT')).toBe(true);
      expect(spAdapter.canResolve('spotify:album:1DFixLWuPkv3KT3TnV35m3')).toBe(true);
      expect(spAdapter.canResolve('https://apple.com/music')).toBe(false);
    });

    it('recognizes SoundCloud tracks and sets', () => {
      expect(scAdapter.canResolve('https://soundcloud.com/artist-name/sample-track')).toBe(true);
      expect(scAdapter.canResolve('https://m.soundcloud.com/artist-name/sample-track')).toBe(true);
      expect(scAdapter.canResolve('https://soundcloud.com/artist-name/sets/album-set')).toBe(true);
      expect(scAdapter.canResolve('https://soundcloud.com')).toBe(false);
    });

    it('recognizes Deezer tracks, albums, playlists, and shortlinks', () => {
      expect(dzAdapter.canResolve('https://www.deezer.com/track/3135556')).toBe(true);
      expect(dzAdapter.canResolve('https://www.deezer.com/album/12345')).toBe(true);
      expect(dzAdapter.canResolve('https://www.deezer.com/playlist/98765')).toBe(true);
      expect(dzAdapter.canResolve('https://deezer.page.link/abc1234')).toBe(true);
      expect(dzAdapter.canResolve('https://tidal.com')).toBe(false);
    });

    it('recognizes direct audio streams by file extension', () => {
      expect(directAdapter.canResolve('https://example.com/audio/song.mp3')).toBe(true);
      expect(directAdapter.canResolve('https://example.com/audio/track.ogg?token=123')).toBe(true);
      expect(directAdapter.canResolve('https://example.com/stream.m3u8')).toBe(true);
      expect(directAdapter.canResolve('https://example.com/page.html')).toBe(false);
      expect(directAdapter.canResolve('ftp://example.com/song.mp3')).toBe(false);
    });
  });

  describe('2. Single Track & Playlist Resolution', () => {
    it('resolves single YouTube video with metadata and stream', async () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const resolved = await ytAdapter.resolve(url);

      expect('tracks' in resolved).toBe(false);
      const track = resolved as ResolvedTrack;
      expect(track.id).toBe('dQw4w9WgXcQ');
      expect(track.source).toBe('youtube');
      expect(track.durationSeconds).toBeGreaterThan(0);
      expect(track.streamUrl).toBeDefined();

      const stream = await track.getStream();
      expect(stream).toBeDefined();
    }, 15000);

    it('resolves YouTube playlist into multiple tracks', async () => {
      const url = 'https://www.youtube.com/playlist?list=PLrAlnnR2v3e96s61f2w_h_bE2L9';
      const resolved = await ytAdapter.resolve(url);

      expect('tracks' in resolved).toBe(true);
      const playlist = resolved as ResolvedPlaylist;
      expect(playlist.trackCount).toBeGreaterThan(1);
      expect(playlist.tracks.length).toBe(playlist.trackCount);
      expect(playlist.source).toBe('youtube');
      expect(playlist.tracks[0]?.id).toContain('PL_');
    });

    it('resolves Spotify track and album metadata', async () => {
      const trackRes = (await spAdapter.resolve(
        'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      )) as ResolvedTrack;
      expect(trackRes.id).toBe('4cOdK2wGLETKBW3PvgPWqT');
      expect(trackRes.source).toBe('spotify');

      const albumRes = (await spAdapter.resolve(
        'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3',
      )) as ResolvedPlaylist;
      expect(albumRes.trackCount).toBeGreaterThan(0);
      expect(albumRes.tracks.length).toBe(albumRes.trackCount);
    });

    it('resolves SoundCloud track and sets', async () => {
      const trackRes = (await scAdapter.resolve(
        'https://soundcloud.com/alanwalker/faded',
      )) as ResolvedTrack;
      expect(trackRes.artist).toBe('Alanwalker');
      expect(trackRes.title).toBe('Faded');
      expect(trackRes.source).toBe('soundcloud');

      const setRes = (await scAdapter.resolve(
        'https://soundcloud.com/alanwalker/sets/different-world',
      )) as ResolvedPlaylist;
      expect(setRes.trackCount).toBe(6);
      expect(setRes.tracks).toHaveLength(6);
    });

    it('resolves Deezer track with preview stream', async () => {
      const res = (await dzAdapter.resolve(
        'https://www.deezer.com/track/3135556',
      )) as ResolvedTrack;
      expect(res.source).toBe('deezer');
      expect(res.streamUrl).toBeDefined();
    });

    it('resolves direct audio URL extracting filename as title', async () => {
      const res = (await directAdapter.resolve(
        'https://media.sample.com/music/epic-synthwave-track.mp3',
      )) as ResolvedTrack;
      expect(res.source).toBe('direct');
      expect(res.title).toBe('epic synthwave track');
      expect(res.streamUrl).toBe('https://media.sample.com/music/epic-synthwave-track.mp3');
      expect(res.isLive).toBe(false);
    });

    it('identifies m3u8 direct streams as live streams', async () => {
      const res = (await directAdapter.resolve(
        'https://radio.broadcast.org/live/stream.m3u8',
      )) as ResolvedTrack;
      expect(res.isLive).toBe(true);
    });
  });

  describe('3. ExtractorPipeline Orchestration & Search', () => {
    it('delegates to the correct adapter based on URL priority', async () => {
      const ytResult = await pipeline.resolve('https://youtu.be/dQw4w9WgXcQ');
      expect((ytResult as ResolvedTrack).source).toBe('youtube');

      const scResult = await pipeline.resolve('https://soundcloud.com/avicii/levels');
      expect((scResult as ResolvedTrack).source).toBe('soundcloud');
    });

    it('bridges Spotify tracks to playable audio stream using YouTube search fallback', async () => {
      const spotifyUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
      const resolved = (await pipeline.resolve(spotifyUrl)) as ResolvedTrack;

      expect(resolved.source).toBe('spotify');
      // Execute the bridged getStream()
      const stream = await resolved.getStream();
      expect(stream).toBeDefined();
      // Live network: the YouTube search fallback alone can take ~15s from CI runners.
    }, 30000);

    it('bridges Spotify album tracks to playable audio stream', async () => {
      const spotifyAlbumUrl = 'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3';
      const resolved = (await pipeline.resolve(spotifyAlbumUrl)) as ResolvedPlaylist;

      expect(resolved.source).toBe('spotify');
      expect(resolved.tracks.length).toBeGreaterThan(0);
      const firstStream = await resolved.tracks[0]?.getStream();
      expect(firstStream).toBeDefined();
    }, 25000);

    it('resolves keyword search queries using default search source', async () => {
      const searchResult = (await pipeline.resolve('YOASOBI Idol')) as ResolvedTrack;
      expect(searchResult).toBeDefined();
      expect(searchResult.source).toBeDefined();
      expect(searchResult.url).toBeDefined();
    });

    it('returns search results list for a query', async () => {
      const results = await pipeline.search('Beethoven Symphony', 'youtube', 3);
      expect(results).toHaveLength(3);
      expect(results[0]?.source).toBe('youtube');
      expect(results[0]?.title.toLowerCase()).toContain('beethoven');
    });

    it('reports health check status across all registered adapters', async () => {
      const healthReports = await pipeline.healthCheck();
      expect(healthReports).toHaveLength(5);
      for (const report of healthReports) {
        expect(report.isHealthy).toBe(true);
        expect(report.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('throws descriptive error on invalid URLs or empty queries', async () => {
      await expect(pipeline.resolve('')).rejects.toThrow('Cannot resolve empty music query');
      await expect(pipeline.resolve('https://unsupported-unknown-site.xyz/audio')).rejects.toThrow(
        'No compatible music extractor found',
      );
    });
  });

  describe('6. YouTube Fallback Tier 5 — Canonical Spotify Metadata', () => {
    const stubResolver = (result: Partial<MusicSearchResult> | null): CanonicalMetadataResolver =>
      ({
        id: 'spotify',
        name: 'Stub Metadata Resolver',
        priority: 20,
        canResolve: () => false,
        search: async () => (result ? [result as MusicSearchResult] : []),
        resolve: async () => {
          throw new Error('not used');
        },
        healthCheck: async () => ({ source: 'spotify', isHealthy: true, latencyMs: 0 }),
      }) as CanonicalMetadataResolver;

    it('wires the Spotify adapter into the YouTube cascade on pipeline construction', () => {
      const wired = new ExtractorPipeline({ adapters: [ytAdapter, spAdapter] });
      expect(wired.getAdapter('youtube')).toBe(ytAdapter);
      // Resolver is wired, so canonical lookups are attempted instead of self-skipping
      expect(ytAdapter.getMetadataResolver()).toBe(spAdapter);
    });

    it('returns a canonical "Artist - Title" pair when the resolver matches the YouTube title', async () => {
      ytAdapter.setMetadataResolver(stubResolver({ title: 'Lemon', artist: 'Kenshi Yonezu' }));
      const canonical = await ytAdapter.resolveCanonicalQuery('Lemon MV', 'KenshiYonezuVEVO');
      expect(canonical).toBe('Kenshi Yonezu - Lemon');
    });

    it('rejects unrelated resolver hits so fallback queries are not poisoned', async () => {
      ytAdapter.setMetadataResolver(
        stubResolver({ title: 'Blinding Lights', artist: 'The Weeknd' }),
      );
      expect(await ytAdapter.resolveCanonicalQuery('Lemon', 'Kenshi Yonezu')).toBeNull();
    });

    it('self-skips when no resolver is wired or the resolver returns nothing', async () => {
      ytAdapter.setMetadataResolver(undefined);
      expect(await ytAdapter.resolveCanonicalQuery('Lemon', 'Kenshi Yonezu')).toBeNull();

      ytAdapter.setMetadataResolver(stubResolver(null));
      expect(await ytAdapter.resolveCanonicalQuery('Lemon', 'Kenshi Yonezu')).toBeNull();
    });
  });

  describe('7. Spotify Web API Client Credentials & Session Cookie Fallback', () => {
    it('accepts and parses Spotify track, album, and playlist URLs and URIs', () => {
      expect(spAdapter.canResolve('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(
        true,
      );
      expect(spAdapter.canResolve('spotify:track:4cOdK2wGLETKBW3PvgPWqT')).toBe(true);
      expect(spAdapter.canResolve('https://open.spotify.com/album/4LH4d3cOWNNXdsqFd4G7gv')).toBe(
        true,
      );
      expect(spAdapter.canResolve('spotify:album:4LH4d3cOWNNXdsqFd4G7gv')).toBe(true);
      expect(spAdapter.canResolve('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe(
        true,
      );
      expect(spAdapter.canResolve('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe(true);

      expect(spAdapter.canResolve('https://soundcloud.com/artist/track')).toBe(false);
      expect(spAdapter.canResolve('plain search query')).toBe(false);

      const parsed = spAdapter.parseUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
      expect(parsed).toEqual({ type: 'track', id: '4cOdK2wGLETKBW3PvgPWqT' });

      const parsedUri = spAdapter.parseUrl('spotify:album:4LH4d3cOWNNXdsqFd4G7gv');
      expect(parsedUri).toEqual({ type: 'album', id: '4LH4d3cOWNNXdsqFd4G7gv' });
    });

    it('accurately identifies when Web API credentials are provided vs cookie fallback', () => {
      const withCreds = new SpotifyAdapter({
        clientId: 'mock_client_id',
        clientSecret: 'mock_client_secret',
      });
      expect(withCreds.hasWebApiCredentials()).toBe(true);

      const withoutCreds = new SpotifyAdapter({});
      // Relies on environment or session cookies
      expect(typeof withoutCreds.hasWebApiCredentials()).toBe('boolean');
    });

    it('performs search and health check successfully', async () => {
      const results = await spAdapter.search('Never Gonna Give You Up', 2);
      expect(Array.isArray(results)).toBe(true);

      const health = await spAdapter.healthCheck();
      expect(health.source).toBe('spotify');
      expect(typeof health.isHealthy).toBe('boolean');
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
