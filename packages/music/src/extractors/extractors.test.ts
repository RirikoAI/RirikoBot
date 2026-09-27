import { Readable } from 'node:stream';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// These tests run offline. YouTube (youtubei.js), SoundCloud (play-dl), Spotify (spotify-url-info)
// and every fetch() are replaced with in-memory fakes, because live calls made the suite time out
// on CircleCI whenever a provider answered slowly or blocked the datacenter IP.
const mocks = vi.hoisted(() => ({
  innertubeCreate: vi.fn(),
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

vi.mock('youtubei.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('youtubei.js')>()),
  Innertube: { create: mocks.innertubeCreate },
}));
vi.mock('play-dl', () => ({ default: mocks.play }));
vi.mock('spotify-url-info', () => ({
  default: () => ({ getData: mocks.spotifyGetData, getTracks: mocks.spotifyGetTracks }),
}));

interface FakeVideo {
  id: string;
  title: string;
  author: string;
  duration: number;
}

const YOUTUBE_CATALOG: FakeVideo[] = [
  {
    id: 'dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
    author: 'Rick Astley',
    duration: 213,
  },
  {
    id: 'TUVcZfQe-Kw',
    title: 'Dua Lipa - Levitating (Official Music Video)',
    author: 'Dua Lipa',
    duration: 203,
  },
  {
    id: 'ZRtdQ81jPUQ',
    title: 'YOASOBI Idol Official Music Video',
    author: 'YOASOBI',
    duration: 213,
  },
  { id: 'fOk8Tm815lE', title: 'Beethoven - Symphony No. 5', author: 'Classical', duration: 1860 },
  { id: 'vY-hU8Rw3lI', title: 'Beethoven - Symphony No. 9', author: 'Classical', duration: 4200 },
  { id: 'A3h7Xh6Fq3Y', title: 'Beethoven - Moonlight Sonata', author: 'Classical', duration: 900 },
];

const tokens = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];

// Ranks catalog videos by how many query words their title or channel contains.
function searchCatalog(query: string): FakeVideo[] {
  const queryTokens = tokens(query);
  return YOUTUBE_CATALOG.map((video) => {
    const haystack = new Set(tokens(`${video.title} ${video.author}`));
    return { video, hits: queryTokens.filter((t) => haystack.has(t)).length };
  })
    .filter(({ hits }) => hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map(({ video }) => video);
}

const webAudio = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });

function createFakeInnertube() {
  return {
    session: {},
    getInfo: vi.fn(async (id: string) => {
      const video = YOUTUBE_CATALOG.find((v) => v.id === id);
      if (!video) throw new Error(`Video ${id} unavailable`);
      return {
        basic_info: {
          title: video.title,
          author: video.author,
          duration: video.duration,
          thumbnail: [{ url: `https://i.ytimg.com/vi/${id}/hq.jpg` }],
        },
      };
    }),
    getPlaylist: vi.fn(async () => ({
      info: { title: 'Study Mix', thumbnails: [{ url: 'https://i.ytimg.com/mix.jpg' }] },
      videos: [{ id: 'dQw4w9WgXcQ' }, { video_id: 'TUVcZfQe-Kw' }, {}],
    })),
    search: vi.fn(async (query: string) => ({
      videos: searchCatalog(query).map((v) => ({
        id: v.id,
        title: { text: v.title },
        author: { name: v.author },
        duration: { seconds: v.duration },
      })),
    })),
    download: vi.fn(async () => webAudio()),
  };
}

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
  let ytAdapter: YouTubeAdapter;
  let spAdapter: SpotifyAdapter;
  let scAdapter: SoundCloudAdapter;
  let dzAdapter: DeezerAdapter;
  let directAdapter: DirectAdapter;
  let innertube: ReturnType<typeof createFakeInnertube>;
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

    innertube = createFakeInnertube();
    mocks.innertubeCreate.mockResolvedValue(innertube);

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

    // Background PO token generation would fetch YouTube's embed page.
    ytAdapter = new YouTubeAdapter({ autoGeneratePoToken: false });
    spAdapter = new SpotifyAdapter();
    scAdapter = new SoundCloudAdapter();
    dzAdapter = new DeezerAdapter();
    directAdapter = new DirectAdapter();

    pipeline = new ExtractorPipeline({
      adapters: [ytAdapter, spAdapter, scAdapter, dzAdapter, directAdapter],
      defaultSearchSource: 'youtube',
    });
  });

  afterEach(() => {
    ytAdapter.getPoTokenService()?.stopAutoRotation();
    expect(unexpectedRequests).toEqual([]);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetAllMocks();
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
      expect(track).toMatchObject({
        id: 'dQw4w9WgXcQ',
        source: 'youtube',
        title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
        artist: 'Rick Astley',
        durationSeconds: 213,
        streamUrl: url,
      });

      const stream = await track.getStream();
      expect(stream).toBeInstanceOf(Readable);
      expect(innertube.download).toHaveBeenCalledWith('dQw4w9WgXcQ', expect.anything());
    });

    it('resolves YouTube playlist into multiple tracks', async () => {
      const url = 'https://www.youtube.com/playlist?list=PLrAlnnR2v3e96s61f2w_h_bE2L9';
      const playlist = (await ytAdapter.resolve(url)) as ResolvedPlaylist;

      expect(innertube.getPlaylist).toHaveBeenCalledWith('PLrAlnnR2v3e96s61f2w_h_bE2L9');
      expect(playlist.title).toBe('Study Mix');
      expect(playlist.source).toBe('youtube');
      expect(playlist.trackCount).toBe(2);
      expect(playlist.tracks.map((t) => t.id)).toEqual(['dQw4w9WgXcQ', 'TUVcZfQe-Kw']);
      expect(playlist.tracks[1]).toMatchObject({
        title: 'Dua Lipa - Levitating (Official Music Video)',
        artist: 'Dua Lipa',
        durationSeconds: 203,
        url: 'https://www.youtube.com/watch?v=TUVcZfQe-Kw',
      });
    });

    it('falls back to placeholder playlist tracks when the playlist lookup fails', async () => {
      innertube.getPlaylist.mockRejectedValue(new Error('This playlist does not exist'));

      const url = 'https://www.youtube.com/playlist?list=PLrAlnnR2v3e96s61f2w_h_bE2L9';
      const playlist = (await ytAdapter.resolve(url)) as ResolvedPlaylist;

      expect(playlist.source).toBe('youtube');
      expect(playlist.trackCount).toBe(5);
      expect(playlist.tracks).toHaveLength(5);
      expect(playlist.tracks[0]?.id).toBe('PL_PLrAln_01');
    });

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
      const ytResult = await pipeline.resolve('https://youtu.be/dQw4w9WgXcQ');
      expect((ytResult as ResolvedTrack).source).toBe('youtube');

      const scResult = await pipeline.resolve('https://soundcloud.com/avicii/levels');
      expect(scResult).toMatchObject({ source: 'soundcloud', title: 'Levels' });
    });

    it('bridges Spotify tracks to playable audio stream using YouTube search fallback', async () => {
      const spotifyUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
      const resolved = (await pipeline.resolve(spotifyUrl)) as ResolvedTrack;

      expect(resolved.source).toBe('spotify');
      expect(await resolved.getStream()).toBeInstanceOf(Readable);
      expect(innertube.download).toHaveBeenCalledWith('dQw4w9WgXcQ', expect.anything());
    });

    it('bridges Spotify album tracks to playable audio stream', async () => {
      const spotifyAlbumUrl = 'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3';
      const resolved = (await pipeline.resolve(spotifyAlbumUrl)) as ResolvedPlaylist;

      expect(resolved.source).toBe('spotify');
      expect(resolved.tracks).toHaveLength(2);
      expect(await resolved.tracks[0]?.getStream()).toBeInstanceOf(Readable);
      expect(innertube.download).toHaveBeenCalledWith('TUVcZfQe-Kw', expect.anything());
    });

    it('resolves keyword search queries using default search source', async () => {
      const searchResult = (await pipeline.resolve('YOASOBI Idol')) as ResolvedTrack;
      expect(searchResult).toMatchObject({
        id: 'ZRtdQ81jPUQ',
        source: 'youtube',
        url: 'https://www.youtube.com/watch?v=ZRtdQ81jPUQ',
      });
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
