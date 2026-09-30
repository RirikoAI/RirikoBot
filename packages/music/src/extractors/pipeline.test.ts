import { describe, expect, it, vi } from 'vitest';
import { ExtractorPipeline, createStandardAdapters } from './pipeline.js';
import { SpotifyAdapter } from './spotify.adapter.js';
import type { CanonicalMetadataResolver, MusicSourceAdapter } from '../types.js';

function fakeAdapter(
  id: MusicSourceAdapter['id'],
  setMetadataResolver?: (resolver: CanonicalMetadataResolver | undefined) => void,
): MusicSourceAdapter {
  return {
    id,
    name: `Fake ${id}`,
    priority: 10,
    canResolve: (input) => input.includes(`${id}.test`),
    search: async () => [],
    resolve: async () => {
      throw new Error('not used');
    },
    healthCheck: async () => ({ source: id, isHealthy: true, latencyMs: 0 }),
    ...(setMetadataResolver ? { setMetadataResolver } : {}),
  };
}

describe('ExtractorPipeline without a YouTube extractor', () => {
  it('registers only the standard adapters by default', () => {
    const ids = new ExtractorPipeline().getAdapters().map((adapter) => adapter.id);
    expect(ids.sort()).toEqual(['deezer', 'direct', 'soundcloud', 'spotify']);
    expect(createStandardAdapters().map((adapter) => adapter.id)).not.toContain('youtube');
  });

  it('reports YouTube links as unsupported instead of guessing an extractor', async () => {
    const pipeline = new ExtractorPipeline();
    expect(pipeline.canResolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    await expect(pipeline.resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).rejects.toThrow(
      'No compatible music extractor found for URL',
    );
  });

  it('hands the Spotify adapter to every adapter that accepts a metadata resolver', () => {
    const spotify = new SpotifyAdapter();
    const setResolver = vi.fn();
    const injected = fakeAdapter('youtube', setResolver);

    const pipeline = new ExtractorPipeline({
      adapters: [...createStandardAdapters().filter((a) => a.id !== 'spotify'), spotify, injected],
    });

    expect(pipeline.getAdapter('youtube')).toBe(injected);
    expect(setResolver).toHaveBeenCalledExactlyOnceWith(spotify);
  });

  it('skips metadata wiring when no Spotify adapter is registered', () => {
    const setResolver = vi.fn();
    new ExtractorPipeline({ adapters: [fakeAdapter('youtube', setResolver)] });
    expect(setResolver).not.toHaveBeenCalled();
  });
});
