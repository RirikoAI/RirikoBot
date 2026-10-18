import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotifyAdapter, type MusicSourceAdapter } from '@ririko/music';
import { createMusicPipeline, type PrivateMusicPackageLoader } from './music-sources.js';

function privateAdapter(setMetadataResolver = vi.fn()): MusicSourceAdapter {
  return {
    id: 'youtube',
    name: 'Private Adapter',
    priority: 10,
    canResolve: () => false,
    search: async () => [],
    resolve: async () => {
      throw new Error('not used');
    },
    healthCheck: async () => ({ source: 'youtube', isHealthy: true, latencyMs: 0 }),
    setMetadataResolver,
  };
}

describe('createMusicPipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([undefined, 'false', 'TRUE', '1'])(
    'never imports the private package when USE_PRIVATE_MUSIC_PACKAGE is %j',
    async (flag) => {
      const load = vi.fn<PrivateMusicPackageLoader>();
      const pipeline = await createMusicPipeline({ USE_PRIVATE_MUSIC_PACKAGE: flag }, load);

      expect(load).not.toHaveBeenCalled();
      expect(pipeline.getAdapter('youtube')).toBeUndefined();
      expect(pipeline.getAdapter('soundcloud')).toBeDefined();
    },
  );

  it('adds the private adapters, wired to Spotify metadata, when the flag is true', async () => {
    const setMetadataResolver = vi.fn();
    const adapter = privateAdapter(setMetadataResolver);
    const createMusicAdapters = vi.fn(() => [adapter]);
    const env = { USE_PRIVATE_MUSIC_PACKAGE: 'true', YOUTUBE_COOKIE: 'cookie' };

    const pipeline = await createMusicPipeline(env, async () => ({ createMusicAdapters }));

    expect(createMusicAdapters).toHaveBeenCalledWith(env);
    expect(pipeline.getAdapter('youtube')).toBe(adapter);
    expect(setMetadataResolver).toHaveBeenCalledWith(pipeline.getAdapter('spotify'));
    expect(pipeline.getAdapter('spotify')).toBeInstanceOf(SpotifyAdapter);
  });

  it.each([
    ['is not installed', () => Promise.reject(new Error("Cannot find module 'index.js'"))],
    ['exports no adapter factory', () => Promise.resolve({})],
  ])('warns and keeps the standard adapters when the package %s', async (_case, load) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const pipeline = await createMusicPipeline({ USE_PRIVATE_MUSIC_PACKAGE: 'true' }, load);

    expect(pipeline.getAdapter('youtube')).toBeUndefined();
    expect(pipeline.getAdapters()).toHaveLength(4);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('continuing without it'));
  });
});
