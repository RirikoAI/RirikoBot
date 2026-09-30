import { Readable } from 'node:stream';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ExtractorPipeline,
  SpotifyAdapter,
  SoundCloudAdapter,
  DeezerAdapter,
  DirectAdapter,
} from './index.js';
import type { MusicSourceAdapter, ResolvedTrack, ResolvedPlaylist } from '../types.js';

// These tests run offline. SoundCloud (play-dl), Spotify (spotify-url-info) and every fetch() are
// replaced with in-memory fakes, because live calls made the suite time out on CircleCI whenever a
// provider answered slowly or blocked the datacenter IP.
const mocks = vi.hoisted(() => ({
  play: {
    getFreeClientID: vi.fn(),
    setToken: vi.fn(),
    soundcloud: vi.fn(),
    search: vi.fn(),
    stream_from_info: vi.fn(),
  },
  spotifyGetData: vi.fn(),
  spotifyGetTracks: vi.fn(),
}));

vi.mock('play-dl', () => ({ default: mocks.play }));
vi.mock('spotify-url-info', () => ({
  default: () => ({ getData: mocks.spotifyGetData, getTracks: mocks.spotifyGetTracks }),
}));

function soundcloudTrack(slug: string, name: string, artist: string) {
  return {
    type: 'track',
    id: slug.length,
    name,
    user: { name: artist },
    durationInSec: 212,
    url: `https://soundcloud.com/${slug}`,
    thumbnail: 'https://i1.sndcdn.com/artwork.jpg',
  };
}

const DEEZER_TRACK = {
  id: 3135556,
  title: 'Harder, Better, Faster, Stronger',
  artist: { name: 'Daft Punk' },
  duration: 224,
  preview: 'https://cdnt-preview.dzcdn.net/harder-better.mp3',
  link: 'https://www.deezer.com/track/3135556',
  album: { cover_big: 'https://e-cdns-images.dzcdn.net/cover.jpg' },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Multi-Source Music Extractors & Source Adapters (TASK-0501)', () => {
  let pipeline: ExtractorPipeline;
  let spAdapter: SpotifyAdapter;
  let scAdapter: SoundCloudAdapter;
  let dzAdapter: DeezerAdapter;
  let directAdapter: DirectAdapter;
  let unexpectedRequests: string[];

  beforeEach(() => {
    // Spotify credentials in the environment would switch the adapter to the Web API path.
    for (const name of [
      'SPOTIFY_CLIENT_ID',
      'SPOTIFY_CLIENT_SECRET',
      'SPOTIFY_REFRESH_TOKEN',
      'SPOTIFY_DC',
      'SP_DC',
      'SPOTIFY_KEY',
      'SP_KEY',
    ]) {
      vi.stubEnv(name, '');
    }

    unexpectedRequests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === 'https://api.deezer.com/track/3135556') return jsonResponse(DEEZER_TRACK);
        if (url.startsWith('https://api.deezer.com/search?')) {
          return jsonResponse({ data: [DEEZER_TRACK] });
        }
        if (url === 'https://api.deezer.com/infos') return jsonResponse({ open: true });
        if (url === DEEZER_TRACK.preview) return new Response(new Uint8Array([1, 2, 3]));
        unexpectedRequests.push(url);
        throw new Error(`Unexpected network request in test: ${url}`);
      }),
    );

    mocks.play.getFreeClientID.mockResolvedValue('sc-test-client');
    mocks.play.setToken.mockResolvedValue(undefined);
    mocks.play.search.mockResolvedValue([]);
    mocks.play.stream_from_info.mockImplementation(async () => ({
      stream: Readable.from([Buffer.from('audio')]),
    }));
    mocks.play.soundcloud.mockImplementation(async (url: string) => {
      if (url.includes('/sets/')) {
        return {
          type: 'playlist',
          name: 'Different World',
          all_tracks: async () => [
            soundcloudTrack('alanwalker/lost-control', 'Lost Control', 'Alan Walker'),
            soundcloudTrack('alanwalker/darkside', 'Darkside', 'Alan Walker'),
          ],
        };
      }
      const slug = url.replace(/^https?:\/\/(www\.|m\.)?soundcloud\.com\//, '');
      return soundcloudTrack(
        slug,
        slug.split('/')[1] === 'levels' ? 'Levels' : 'Faded',
        'Alan Walker',
      );
    });

    mocks.spotifyGetData.mockImplementation(async (url: string) =>
      url.includes('/album/')
        ? { name: 'Future Nostalgia', images: [{ url: 'https://i.scdn.co/album.jpg' }] }
        : { name: 'Never Gonna Give You Up', artist: 'Rick Astley', duration: 213000 },
    );
    mocks.spotifyGetTracks.mockResolvedValue([
      { id: 'levitating01', name: 'Levitating', artist: 'Dua Lipa', duration: 203000, uri: 'x' },
      { id: 'physical0001', name: 'Physical', artist: 'Dua Lipa', duration: 193000, uri: 'x' },
    ]);

    spAdapter = new SpotifyAdapter();
    scAdapter = new SoundCloudAdapter();
    dzAdapter = new DeezerAdapter();
    directAdapter = new DirectAdapter();

    pipeline = new ExtractorPipeline({
      adapters: [spAdapter, scAdapter, dzAdapter, directAdapter],
    });
  });

  afterEach(() => {
    expect(unexpectedRequests).toEqual([]);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  describe('1. URL Pattern Recognition & Detection', () => {
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
    it('resolves Spotify track and album metadata', async () => {
      const trackRes = (await spAdapter.resolve(
        'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      )) as ResolvedTrack;
      expect(trackRes).toMatchObject({
        id: '4cOdK2wGLETKBW3PvgPWqT',
        source: 'spotify',
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
        durationSeconds: 213,
      });

      const albumRes = (await spAdapter.resolve(
        'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3',
      )) as ResolvedPlaylist;
      expect(albumRes.title).toBe('Future Nostalgia');
      expect(albumRes.trackCount).toBe(2);
      expect(albumRes.tracks.map((t) => t.title)).toEqual(['Levitating', 'Physical']);
    });

    it('resolves SoundCloud track and sets', async () => {
      const trackRes = (await scAdapter.resolve(
        'https://soundcloud.com/alanwalker/faded',
      )) as ResolvedTrack;
      expect(trackRes).toMatchObject({
        artist: 'Alan Walker',
        title: 'Faded',
        source: 'soundcloud',
        url: 'https://soundcloud.com/alanwalker/faded',
      });
      expect(await trackRes.getStream()).toBeInstanceOf(Readable);

      const setRes = (await scAdapter.resolve(
        'https://soundcloud.com/alanwalker/sets/different-world',
      )) as ResolvedPlaylist;
      expect(setRes.title).toBe('Different World');
      expect(setRes.trackCount).toBe(2);
      expect(setRes.tracks.map((t) => t.title)).toEqual(['Lost Control', 'Darkside']);
    });

    it('falls back to URL-derived SoundCloud metadata when the lookup fails', async () => {
      mocks.play.soundcloud.mockRejectedValue(new Error('404'));

      const trackRes = (await scAdapter.resolve(
        'https://soundcloud.com/alanwalker/faded',
      )) as ResolvedTrack;
      expect(trackRes.artist).toBe('Alanwalker');
      expect(trackRes.title).toBe('Faded');

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
      expect(res).toMatchObject({
        id: 'dz_3135556',
        source: 'deezer',
        title: 'Harder, Better, Faster, Stronger',
        artist: 'Daft Punk',
        streamUrl: DEEZER_TRACK.preview,
      });
      expect(await res.getStream()).toBeInstanceOf(Readable);
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
      const scResult = await pipeline.resolve('https://soundcloud.com/avicii/levels');
      expect(scResult).toMatchObject({ source: 'soundcloud', title: 'Levels' });

      const directResult = await pipeline.resolve('https://media.sample.com/music/intro.mp3');
      expect(directResult).toMatchObject({ source: 'direct', title: 'intro' });
    });

    it('bridges Spotify tracks to a playable SoundCloud stream', async () => {
      mocks.play.search.mockResolvedValue([
        soundcloudTrack('rickastley/never-gonna', 'Never Gonna Give You Up', 'Rick Astley'),
      ]);
      const spotifyUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
      const resolved = (await pipeline.resolve(spotifyUrl)) as ResolvedTrack;

      expect(resolved.source).toBe('spotify');
      expect(await resolved.getStream()).toBeInstanceOf(Readable);
      expect(mocks.play.soundcloud).toHaveBeenCalledWith(
        'https://soundcloud.com/rickastley/never-gonna',
      );
    });

    it('bridges Spotify album tracks to playable audio streams', async () => {
      mocks.play.search.mockResolvedValue([
        soundcloudTrack('dualipa/levitating', 'Levitating', 'Dua Lipa'),
      ]);
      const spotifyAlbumUrl = 'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3';
      const resolved = (await pipeline.resolve(spotifyAlbumUrl)) as ResolvedPlaylist;

      expect(resolved.source).toBe('spotify');
      expect(resolved.tracks).toHaveLength(2);
      expect(await resolved.tracks[0]?.getStream()).toBeInstanceOf(Readable);
      expect(mocks.play.soundcloud).toHaveBeenCalledWith(
        'https://soundcloud.com/dualipa/levitating',
      );
    });

    it('prefers an added adapter registered as youtube over SoundCloud when bridging', async () => {
      const bridged = Readable.from([Buffer.from('added source audio')]);
      const addedTrack = {
        id: 'added01',
        title: 'Rick Astley - Never Gonna Give You Up',
        artist: 'Rick Astley',
        durationSeconds: 213,
        url: 'https://added.example/never-gonna',
        source: 'youtube' as const,
      };
      const added: MusicSourceAdapter = {
        id: 'youtube',
        name: 'Added Source',
        priority: 10,
        canResolve: () => false,
        search: vi.fn(async () => [addedTrack]),
        resolve: vi.fn(async () => ({ ...addedTrack, getStream: async () => bridged })),
        healthCheck: async () => ({ source: 'youtube', isHealthy: true, latencyMs: 0 }),
      };
      const withAdded = new ExtractorPipeline({ adapters: [added, spAdapter, scAdapter] });

      const resolved = (await withAdded.resolve(
        'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      )) as ResolvedTrack;

      expect(await resolved.getStream()).toBe(bridged);
      expect(added.resolve).toHaveBeenCalledWith(addedTrack.url);
      expect(mocks.play.search).not.toHaveBeenCalled();
    });

    it('resolves keyword search queries using SoundCloud as the default search source', async () => {
      mocks.play.search.mockResolvedValue([
        soundcloudTrack('alanwalker/faded', 'Faded', 'Alan Walker'),
      ]);
      const searchResult = (await pipeline.resolve('Alan Walker Faded')) as ResolvedTrack;
      expect(searchResult).toMatchObject({
        source: 'soundcloud',
        title: 'Faded',
        url: 'https://soundcloud.com/alanwalker/faded',
      });
    });

    it('returns search results list for a query', async () => {
      mocks.play.search.mockResolvedValue([
        soundcloudTrack('alanwalker/faded', 'Faded', 'Alan Walker'),
        soundcloudTrack('alanwalker/darkside', 'Darkside', 'Alan Walker'),
      ]);
      const results = await pipeline.search('Alan Walker', 'soundcloud', 2);
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.source)).toEqual(['soundcloud', 'soundcloud']);
      expect(results[0]?.title).toBe('Faded');
    });

    it('reports health check status across all registered adapters', async () => {
      const healthReports = await pipeline.healthCheck();
      expect(healthReports).toHaveLength(4);
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
      expect(withoutCreds.hasWebApiCredentials()).toBe(false);
    });

    it('performs search and health check successfully', async () => {
      const results = await spAdapter.search('Harder Better Faster Stronger', 2);
      expect(results).toEqual([
        expect.objectContaining({
          id: 'sp_meta_3135556',
          title: 'Harder, Better, Faster, Stronger',
          artist: 'Daft Punk',
          source: 'spotify',
        }),
      ]);

      const health = await spAdapter.healthCheck();
      expect(health.source).toBe('spotify');
      expect(health.isHealthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
