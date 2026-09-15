import { describe, it, expect, beforeEach } from 'vitest';
import {
  AntiSpamEvaluator,
  levenshteinDistance,
  calculateSimilarity,
} from './anti-spam.js';

describe('Anti-Spam & Abuse Protection Engine', () => {
  describe('Levenshtein Distance & Similarity Math', () => {
    it('calculates exact matches as distance 0 and similarity 1.0', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
      expect(calculateSimilarity('hello', 'hello')).toBe(1.0);
    });

    it('handles empty strings properly', () => {
      expect(levenshteinDistance('', '')).toBe(0);
      expect(calculateSimilarity('', '')).toBe(1.0);
      expect(levenshteinDistance('abc', '')).toBe(3);
      expect(calculateSimilarity('abc', '')).toBe(0.0);
    });

    it('computes accurate similarity for subtle edits', () => {
      const a = 'The quick brown fox jumps over the lazy dog';
      const b = 'The quick brown fox jumps over the lazy dog!';
      const sim = calculateSimilarity(a, b);
      expect(sim).toBeGreaterThan(0.95);
    });

    it('detects completely distinct text with low similarity', () => {
      const a = 'hello world';
      const b = 'completely different text here';
      const sim = calculateSimilarity(a, b);
      expect(sim).toBeLessThan(0.3);
    });
  });

  describe('AntiSpamEvaluator Heuristics', () => {
    let evaluator: AntiSpamEvaluator;

    beforeEach(() => {
      evaluator = new AntiSpamEvaluator({
        cooldownSeconds: 60,
        similarityThreshold: 0.8,
        minContentLength: 5,
        historyDepth: 3,
        burstIntervalVarianceMinMs: 100,
        burstThresholdCount: 5,
        shadowCooldownMs: 1800_000,
      });
    });

    it('rejects short messages with fewer than 5 non-whitespace characters', () => {
      const r1 = evaluator.evaluateMessage('u1', 'g1', 'hi');
      expect(r1.isAllowed).toBe(false);
      expect(r1.reason).toBe('MIN_LENGTH');

      const r2 = evaluator.evaluateMessage('u1', 'g1', '   a b   ');
      expect(r2.isAllowed).toBe(false);
      expect(r2.reason).toBe('MIN_LENGTH');

      const r3 = evaluator.evaluateMessage('u1', 'g1', 'hello');
      expect(r3.isAllowed).toBe(true);
    });

    it('enforces rolling window cooldown of 60 seconds per user per guild', () => {
      const t0 = 1_000_000;
      const r1 = evaluator.evaluateMessage('u1', 'g1', 'First valid message', t0);
      expect(r1.isAllowed).toBe(true);

      // 30 seconds later (within 60s cooldown)
      const r2 = evaluator.evaluateMessage('u1', 'g1', 'Second different message', t0 + 30_000);
      expect(r2.isAllowed).toBe(false);
      expect(r2.reason).toBe('COOLDOWN');

      // 61 seconds later (cooldown expired)
      const r3 = evaluator.evaluateMessage('u1', 'g1', 'Third different message', t0 + 61_000);
      expect(r3.isAllowed).toBe(true);
    });

    it('isolates cooldowns across different users and guilds', () => {
      const t0 = 1_000_000;
      const r1 = evaluator.evaluateMessage('u1', 'g1', 'Message from user 1', t0);
      expect(r1.isAllowed).toBe(true);

      // Same time, different user in same guild
      const r2 = evaluator.evaluateMessage('u2', 'g1', 'Message from user 2', t0);
      expect(r2.isAllowed).toBe(true);

      // Same user in different guild
      const r3 = evaluator.evaluateMessage('u1', 'g2', 'Message in different guild', t0);
      expect(r3.isAllowed).toBe(true);
    });

    it('detects and rejects copy-paste & highly similar messages (>80% similarity)', () => {
      const t0 = 1_000_000;
      // Message 1
      const r1 = evaluator.evaluateMessage('u1', 'g1', 'Welcome to the server everyone!', t0);
      expect(r1.isAllowed).toBe(true);

      // Message 2 (61s later, but 96% similar)
      const r2 = evaluator.evaluateMessage(
        'u1',
        'g1',
        'Welcome to the server everyone!!',
        t0 + 61_000,
      );
      expect(r2.isAllowed).toBe(false);
      expect(r2.reason).toBe('SIMILARITY_EXCEEDED');

      // Message 3 (another 61s later, completely distinct)
      const r3 = evaluator.evaluateMessage(
        'u1',
        'g1',
        'Let us talk about the next raid battle tonight.',
        t0 + 122_000,
      );
      expect(r3.isAllowed).toBe(true);
    });

    it('flags automated self-bot burst patterns (<100ms interval variance) and enforces shadow cooldown', () => {
      const t0 = 1_000_000;
      // 5 automated messages sent at exactly 500ms intervals (zero variance)
      evaluator.evaluateMessage('bot1', 'g1', 'Automated message number 1', t0);
      evaluator.evaluateMessage('bot1', 'g1', 'Automated message number 2', t0 + 500);
      evaluator.evaluateMessage('bot1', 'g1', 'Automated message number 3', t0 + 1000);
      evaluator.evaluateMessage('bot1', 'g1', 'Automated message number 4', t0 + 1500);

      const rBurst = evaluator.evaluateMessage('bot1', 'g1', 'Automated message number 5', t0 + 2000);
      expect(rBurst.isAllowed).toBe(false);
      expect(rBurst.reason).toBe('AUTOMATED_BURST');

      // Subsequent message within the next 30 minutes gets rejected due to shadow cooldown
      const rShadow = evaluator.evaluateMessage(
        'bot1',
        'g1',
        'Legitimate looking message 10 minutes later',
        t0 + 600_000,
      );
      expect(rShadow.isAllowed).toBe(false);
      expect(rShadow.reason).toBe('SHADOW_COOLDOWN');
    });

    it('sweeps stale entries properly', () => {
      const t0 = Date.now() - 7_200_000; // 2 hours ago
      evaluator.evaluateMessage('oldUser', 'g1', 'Old historical message', t0);
      const swept = evaluator.sweep(3_600_000); // Max age 1 hour
      expect(swept).toBe(1);
    });
  });
});
