import type { ExtractorPipeline } from '../extractors/pipeline.js';
import type { ResolvedTrack } from '../types.js';
import type { QueuedTrack } from './types.js';

export interface AutoplayOptions {
  pipeline: ExtractorPipeline;
  maxSearchResults?: number;
}

export class AutoplayEngine {
  private readonly pipeline: ExtractorPipeline;
  private readonly maxSearchResults: number;

  constructor(options: AutoplayOptions) {
    this.pipeline = options.pipeline;
    this.maxSearchResults = options.maxSearchResults ?? 10;
  }

  /**
   * Generates a recommended track based on the finished track and previous playback history.
   * Deduplicates against recently played tracks and existing queue tracks.
   */
  async getRecommendation(
    seedTrack: ResolvedTrack,
    history: readonly ResolvedTrack[] = [],
    upcoming: readonly ResolvedTrack[] = []
  ): Promise<QueuedTrack | null> {
    const knownUrls = new Set<string>();
    const knownTitles = new Set<string>();

    // Register seed track
    knownUrls.add(seedTrack.url);
    knownTitles.add(seedTrack.title.toLowerCase().trim());

    // Register history
    for (const track of history) {
      knownUrls.add(track.url);
      knownTitles.add(track.title.toLowerCase().trim());
    }

    // Register upcoming queue
    for (const track of upcoming) {
      knownUrls.add(track.url);
      knownTitles.add(track.title.toLowerCase().trim());
    }

    // Formulate queries in order of recommendation relevance
    const queries: string[] = [];
    const cleanArtist = seedTrack.artist.replace(/ - Topic$/i, '').trim();
    if (cleanArtist && cleanArtist !== 'Unknown Artist' && cleanArtist !== seedTrack.title) {
      queries.push(`${cleanArtist} popular songs`);
      queries.push(`${cleanArtist}`);
    }
    queries.push(`${seedTrack.title} mix`);

    for (const query of queries) {
      try {
        const searchResults = await this.pipeline.search(query, undefined, this.maxSearchResults);
        for (const candidate of searchResults) {
          const candidateTitle = candidate.title.toLowerCase().trim();
          if (knownUrls.has(candidate.url) || knownTitles.has(candidateTitle)) {
            continue;
          }

          // Found a candidate that hasn't been played or queued
          const resolved = await this.pipeline.resolve(candidate.url);
          if ('tracks' in resolved) {
            // It's a playlist; pick the first non-known track
            const matchingTrack = resolved.tracks.find(
              (t) => !knownUrls.has(t.url) && !knownTitles.has(t.title.toLowerCase().trim())
            );
            if (matchingTrack) {
              return this.createAutoplayQueuedTrack(matchingTrack);
            }
          } else {
            return this.createAutoplayQueuedTrack(resolved);
          }
        }
      } catch {
        // Continue to next query if search failed
        continue;
      }
    }

    return null;
  }

  private createAutoplayQueuedTrack(track: ResolvedTrack): QueuedTrack {
    return {
      ...track,
      requestedBy: {
        id: 'ririko-autoplay',
        username: 'Ririko Autoplay',
      },
      addedAt: new Date(),
    };
  }
}
