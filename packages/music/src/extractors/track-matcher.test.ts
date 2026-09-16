import { describe, it, expect } from 'vitest';
import { PrecisionTrackMatcher } from './track-matcher.js';
import type { MusicSearchResult, ResolvedTrack } from '../types.js';

describe('PrecisionTrackMatcher (LavaSrc Audio Mirroring)', () => {
  describe('cleanTitle', () => {
    it('strips bracketed noise and common YouTube video tags', () => {
      expect(PrecisionTrackMatcher.cleanTitle('RIDE ON TIME (Official Music Video)')).toBe('RIDE ON TIME');
      expect(PrecisionTrackMatcher.cleanTitle('Never Gonna Give You Up [4K Remastered]')).toBe('Never Gonna Give You Up');
      expect(PrecisionTrackMatcher.cleanTitle('【Rainych & evening cinema】 RIDE ON TIME - Tatsuro Yamashita')).toBe('RIDE ON TIME Tatsuro Yamashita');
      expect(PrecisionTrackMatcher.cleanTitle('Song Title (feat. Artist) [Audio]')).toBe('Song Title');
    });
  });

  describe('calculateDurationScore', () => {
    it('returns high score for exact or near-exact duration', () => {
      expect(PrecisionTrackMatcher.calculateDurationScore(276, 276)).toBe(1.0);
      expect(PrecisionTrackMatcher.calculateDurationScore(276, 278)).toBe(1.0);
      expect(PrecisionTrackMatcher.calculateDurationScore(276, 280)).toBe(0.95);
      expect(PrecisionTrackMatcher.calculateDurationScore(276, 270)).toBe(0.85);
    });

    it('enforces hard rejection for radio shows, podcasts, or DJ mixes', () => {
      // 1-hour radio podcast vs 276s song
      expect(PrecisionTrackMatcher.calculateDurationScore(276, 3600)).toBe(0);
      // 10-minute compilation vs 180s song
      expect(PrecisionTrackMatcher.calculateDurationScore(180, 600)).toBe(0);
      // 30-second snippet vs 240s song
      expect(PrecisionTrackMatcher.calculateDurationScore(240, 30)).toBe(0);
    });
  });

  describe('calculateTitleScore', () => {
    it('recognizes identical or substring title matches', () => {
      expect(PrecisionTrackMatcher.calculateTitleScore('RIDE ON TIME', 'RIDE ON TIME')).toBe(1.0);
      expect(
        PrecisionTrackMatcher.calculateTitleScore(
          'RIDE ON TIME',
          '【Rainych & evening cinema】 RIDE ON TIME - Tatsuro Yamashita ｜ Official Music Video',
        ),
      ).toBe(1.0);
    });

    it('penalizes completely unrelated titles', () => {
      const score = PrecisionTrackMatcher.calculateTitleScore(
        'RIDE ON TIME',
        '2021/09/10 shibuya OIRAN warm up Radio : 初秋のシティポップ特集',
      );
      expect(score).toBeLessThan(0.2);
    });
  });

  describe('calculateArtistScore', () => {
    it('matches multi-artist target against candidate channel and title', () => {
      const candidate: MusicSearchResult = {
        id: 'q1F8YWZtEGg',
        title: '【Rainych & evening cinema】 RIDE ON TIME - Tatsuro Yamashita ｜ Official Music Video',
        artist: 'Rainych Ran',
        durationSeconds: 276,
        url: 'https://www.youtube.com/watch?v=q1F8YWZtEGg',
        source: 'youtube',
      };

      const score = PrecisionTrackMatcher.calculateArtistScore('Rainych, evening cinema', candidate);
      expect(score).toBeGreaterThanOrEqual(0.8);
    });

    it('awards bonus for YouTube Topic channels', () => {
      const candidate: MusicSearchResult = {
        id: 'xyz',
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley - Topic',
        durationSeconds: 213,
        url: 'https://www.youtube.com/watch?v=xyz',
        source: 'youtube',
      };

      const score = PrecisionTrackMatcher.calculateArtistScore('Rick Astley', candidate);
      expect(score).toBeGreaterThanOrEqual(0.95);
    });
  });

  describe('selectBestCandidate — User Track Real World Test', () => {
    const targetTrack: ResolvedTrack = {
      id: '7a6Gj71tooMRmxcZwdGNnh',
      title: 'RIDE ON TIME',
      artist: 'Rainych, evening cinema',
      durationSeconds: 276,
      url: 'https://open.spotify.com/track/7a6Gj71tooMRmxcZwdGNnh',
      source: 'spotify',
      getStream: async () => {
        throw new Error('Preview only');
      },
    };

    it('rejects the 1-hour SoundCloud radio show and selects the exact YouTube official video', () => {
      const candidates: MusicSearchResult[] = [
        // 1. The rogue SoundCloud podcast candidate that caused the user bug
        {
          id: 'sc_radio',
          title: '2021/09/10 shibuya OIRAN warm up Radio : 初秋のシティポップ特集',
          artist: 'block.fm',
          durationSeconds: 3600,
          url: 'https://soundcloud.com/blockfm/shibuya-oiran',
          source: 'soundcloud',
        },
        // 2. An unrelated short preview/reaction video
        {
          id: 'yt_reaction',
          title: '【Rainych & evening cinema】 RIDE ON TIME - Tatsuro Yamashita | REACTION!',
          artist: 'Buddha & Xzendo React',
          durationSeconds: 612,
          url: 'https://www.youtube.com/watch?v=vTkzcnFM1CQ',
          source: 'youtube',
        },
        // 3. The exact official YouTube release
        {
          id: 'q1F8YWZtEGg',
          title: '【Rainych & evening cinema】 RIDE ON TIME - Tatsuro Yamashita ｜ Official Music Video',
          artist: 'Rainych Ran',
          durationSeconds: 276,
          url: 'https://www.youtube.com/watch?v=q1F8YWZtEGg',
          source: 'youtube',
        },
      ];

      const best = PrecisionTrackMatcher.selectBestCandidate(targetTrack, candidates, 0.65);
      expect(best).not.toBeNull();
      expect(best?.candidate.id).toBe('q1F8YWZtEGg');
      expect(best?.candidate.url).toBe('https://www.youtube.com/watch?v=q1F8YWZtEGg');
      expect(best?.score).toBeGreaterThanOrEqual(0.85);

      // Verify rogue SoundCloud candidate scores 0 due to duration guard
      const scScore = PrecisionTrackMatcher.scoreCandidate(targetTrack, candidates[0]!);
      expect(scScore).toBe(0);
    });
  });
});
