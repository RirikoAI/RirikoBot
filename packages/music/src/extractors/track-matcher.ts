import type { MusicSearchResult, ResolvedTrack } from '../types.js';

/**
 * Precision candidate matching engine based on LavaSrc / FredBoat audio mirroring.
 * Uses multi-signal validation:
 * 1. Hard duration guard (rejects long DJ mixes, radio podcasts, compilations, or short previews)
 * 2. Tokenized title similarity (Jaccard token overlap + substring containment)
 * 3. Multi-artist keyword validation across candidate channel & title
 * 4. Official Audio / Topic channel bonuses
 */
export class PrecisionTrackMatcher {
  private static readonly NOISE_REGEX =
    /\s*(?:[([][^()[\]]*(?:official|music\s+video|video|audio|lyrics?|hd|4k|remaster(?:ed)?|visualizer|feat\.?|ft\.?)[^()[\]]*[)\]]|【.*?】|\[.*?\]|\|.*$)/gi;

  private static readonly STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'of',
    'in',
    'on',
    'to',
    'for',
    'with',
    'by',
    'at',
    'from',
    'feat',
    'ft',
  ]);

  /**
   * Cleans and normalizes a track title by removing noise tags, bracketed suffixes, and extra whitespace.
   */
  static cleanTitle(rawTitle: string): string {
    if (!rawTitle) return '';
    return rawTitle
      .replace(PrecisionTrackMatcher.NOISE_REGEX, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Tokenizes text into a lowercase word set, filtering punctuation and stop words.
   */
  static tokenize(text: string): Set<string> {
    const cleaned = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleaned.split(' ').filter((w) => w.length > 0 && !PrecisionTrackMatcher.STOP_WORDS.has(w));
    return new Set(words);
  }

  /**
   * Computes duration matching score with a hard guard.
   * If candidate deviates by >15s AND >12% of track length, returns 0 (instant disqualification).
   */
  static calculateDurationScore(targetSec: number, candidateSec: number): number {
    if (targetSec <= 0 || candidateSec <= 0) return 0.5; // Unknown duration

    const diff = Math.abs(targetSec - candidateSec);
    const relDiff = diff / targetSec;

    // Hard rejection for radio shows, podcasts, compilations or previews
    if (diff > 15 && relDiff > 0.12) {
      return 0;
    }

    if (diff <= 2) return 1.0;
    if (diff <= 5) return 0.95;
    if (diff <= 10) return 0.85;
    if (diff <= 15) return 0.70;

    return Math.max(0, 1 - diff / 25);
  }

  /**
   * Computes title similarity score based on token overlap and substring matching.
   */
  static calculateTitleScore(targetTitle: string, candidateTitle: string): number {
    const cleanTarget = PrecisionTrackMatcher.cleanTitle(targetTitle).toLowerCase();
    const cleanCand = PrecisionTrackMatcher.cleanTitle(candidateTitle).toLowerCase();

    if (!cleanTarget || !cleanCand) return 0;

    // Direct substring or exact match
    if (cleanCand.includes(cleanTarget) || cleanTarget.includes(cleanCand)) {
      return 1.0;
    }

    const targetTokens = PrecisionTrackMatcher.tokenize(cleanTarget);
    const candTokens = PrecisionTrackMatcher.tokenize(cleanCand);

    if (targetTokens.size === 0 || candTokens.size === 0) return 0;

    let matchCount = 0;
    for (const t of targetTokens) {
      if (candTokens.has(t)) matchCount++;
    }

    // Fraction of target title tokens present in candidate
    const targetRecall = matchCount / targetTokens.size;

    // Jaccard union
    const unionSize = new Set([...targetTokens, ...candTokens]).size;
    const jaccard = unionSize > 0 ? matchCount / unionSize : 0;

    return Math.min(1.0, targetRecall * 0.7 + jaccard * 0.3);
  }

  /**
   * Computes artist matching score, checking primary and featured artists across candidate artist and title.
   */
  static calculateArtistScore(targetArtist: string, candidate: MusicSearchResult): number {
    if (!targetArtist) return 0.5;

    const targetArtists = targetArtist
      .split(/[,&/]|(?:feat\.?|ft\.?)\s+/i)
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length > 0);

    if (targetArtists.length === 0) return 0.5;

    const candArtistLower = (candidate.artist || '').toLowerCase();
    const candTitleLower = (candidate.title || '').toLowerCase();
    const candCombined = `${candArtistLower} ${candTitleLower}`;

    let matchedArtists = 0;
    for (const art of targetArtists) {
      const artClean = art.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
      if (!artClean) continue;

      if (candCombined.includes(artClean)) {
        matchedArtists++;
      } else {
        // Check partial word tokens (e.g. "Rainych Ran" matches "Rainych")
        const artTokens = PrecisionTrackMatcher.tokenize(artClean);
        for (const token of artTokens) {
          if (token.length >= 3 && candCombined.includes(token)) {
            matchedArtists += 0.8;
            break;
          }
        }
      }
    }

    const artistRatio = Math.min(1.0, matchedArtists / targetArtists.length);

    // Topic channel bonus
    let topicBonus = 0;
    if (candArtistLower.endsWith(' - topic') || candArtistLower.includes('official')) {
      topicBonus = 0.15;
    }

    return Math.min(1.0, artistRatio * 0.85 + topicBonus);
  }

  /**
   * Scores a candidate against the target track metadata.
   * Returns composite confidence score between 0.0 and 1.0.
   */
  static scoreCandidate(target: ResolvedTrack, candidate: MusicSearchResult): number {
    const durationScore = PrecisionTrackMatcher.calculateDurationScore(
      target.durationSeconds,
      candidate.durationSeconds,
    );

    // If duration failed hard guard, immediately reject
    if (durationScore === 0) {
      return 0;
    }

    const titleScore = PrecisionTrackMatcher.calculateTitleScore(target.title, candidate.title);
    if (titleScore < 0.25) {
      // Title does not match even minimally
      return 0;
    }

    const artistScore = PrecisionTrackMatcher.calculateArtistScore(target.artist, candidate);

    // Weighted composite
    let composite = durationScore * 0.35 + titleScore * 0.45 + artistScore * 0.20;

    // Official Audio bonus
    const titleLower = candidate.title.toLowerCase();
    if (titleLower.includes('official audio') || titleLower.includes('official music video')) {
      composite += 0.05;
    }

    return Math.min(1.0, composite);
  }

  /**
   * Generates prioritized search queries for audio mirroring.
   */
  static generateSearchQueries(target: ResolvedTrack): string[] {
    const queries: string[] = [];
    const cleanTitle = PrecisionTrackMatcher.cleanTitle(target.title) || target.title;
    const cleanArtist = target.artist.replace(/[,&].*$/, '').trim() || target.artist;

    // 1. ISRC exact code search if available
    if (target.isrc) {
      queries.push(target.isrc);
    }

    // 2. Full Artist + Clean Title (Official Audio)
    queries.push(`${target.artist} - ${cleanTitle} official audio`);

    // 3. Full Artist + Clean Title
    queries.push(`${target.artist} - ${cleanTitle}`);

    // 4. Primary Artist + Clean Title
    if (cleanArtist && cleanArtist !== target.artist) {
      queries.push(`${cleanArtist} - ${cleanTitle}`);
    }

    // 5. Clean Title + Artist
    queries.push(`${cleanTitle} ${target.artist}`);

    return queries;
  }

  /**
   * Selects the highest-scoring candidate that passes the minimum confidence threshold.
   */
  static selectBestCandidate(
    target: ResolvedTrack,
    candidates: MusicSearchResult[],
    minConfidence = 0.65,
  ): { candidate: MusicSearchResult; score: number } | null {
    if (!candidates || candidates.length === 0) return null;

    let bestCandidate: MusicSearchResult | null = null;
    let highestScore = -1;

    for (const cand of candidates) {
      const score = PrecisionTrackMatcher.scoreCandidate(target, cand);
      if (score >= minConfidence && score > highestScore) {
        highestScore = score;
        bestCandidate = cand;
      }
    }

    if (!bestCandidate) return null;
    return { candidate: bestCandidate, score: highestScore };
  }
}
