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

describe('ExtractorPipeline health summary (TASK-0502)', () => {
  it('computes overall health summary across all registered extractors', async () => {
    // Each adapter's own health check is covered offline in extractors.test.ts.
    const pipeline = new ExtractorPipeline();
    pipeline.getAdapters().forEach((adapter, index) => {
      vi.spyOn(adapter, 'healthCheck').mockResolvedValue({
        source: adapter.id,
        isHealthy: true,
        latencyMs: (index + 1) * 10,
      });
    });
    const summary = await pipeline.getHealthSummary();

    expect(summary.status).toBe('HEALTHY');
    expect(summary.totalCount).toBe(4);
    expect(summary.healthyCount).toBe(4);
    expect(summary.averageLatencyMs).toBe(25);
    expect(summary.adapters).toHaveLength(4);
    expect(summary.checkedAt).toBeInstanceOf(Date);
  });

  it('marks status as DEGRADED if an adapter fails health check', async () => {
    const mockUnhealthyAdapter = {
      id: 'deezer' as const,
      name: 'Failing Deezer',
      priority: 40,
      canResolve: () => false,
      search: async () => [],
      resolve: async () => {
        throw new Error('Failed');
      },
      healthCheck: async () => ({
        source: 'deezer' as const,
        isHealthy: false,
        latencyMs: 1200,
        errorMessage: '503 Service Unavailable',
      }),
    };

    const pipeline = new ExtractorPipeline({
      adapters: [mockUnhealthyAdapter],
    });

    const summary = await pipeline.getHealthSummary();
    expect(summary.status).toBe('UNHEALTHY');
    expect(summary.healthyCount).toBe(0);
    expect(summary.totalCount).toBe(1);
    expect(summary.adapters[0]?.errorMessage).toBe('503 Service Unavailable');
  });
});
