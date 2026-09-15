import type {
  AntiSpamConfig,
  AntiSpamEvaluation,
} from './types.js';

/**
 * Calculates the Levenshtein edit distance between two strings using
 * memory-efficient O(min(m, n)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let s1 = a;
  let s2 = b;
  if (s1.length < s2.length) {
    s1 = b;
    s2 = a;
  }

  const m = s1.length;
  const n = s2.length;
  let prevRow = new Array<number>(n + 1);
  let currRow = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    const char1 = s1.charCodeAt(i - 1);

    for (let j = 1; j <= n; j++) {
      const char2 = s2.charCodeAt(j - 1);
      const cost = char1 === char2 ? 0 : 1;

      currRow[j] = Math.min(
        currRow[j - 1]! + 1, // insertion
        prevRow[j]! + 1, // deletion
        prevRow[j - 1]! + cost, // substitution
      );
    }

    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[n] ?? 0;
}

/**
 * Computes the similarity ratio between two strings (0.0 = completely different, 1.0 = identical).
 */
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(a, b);
  return 1.0 - distance / maxLen;
}

interface MessageRecord {
  content: string;
  timestamp: number;
}

interface UserSpamState {
  lastRewardAt: number;
  recentMessages: MessageRecord[];
  shadowCooldownUntil: number;
}

interface ResolvedAntiSpamConfig {
  cooldownSeconds: number;
  similarityThreshold: number;
  minContentLength: number;
  historyDepth: number;
  burstIntervalVarianceMinMs: number;
  burstThresholdCount: number;
  shadowCooldownMs: number;
}

/**
 * Anti-Spam Evaluator implementing Section 34 of BLUEPRINT.md:
 * - 60s rolling window reward cooldown per user per guild
 * - Levenshtein similarity filter (>80% similarity against recent 3 messages = 0 XP)
 * - Message quality & minimum length threshold (<5 non-whitespace chars = 0 XP)
 * - Automated typing interval variance check (<100ms variance triggers 30m shadow cooldown)
 */
export class AntiSpamEvaluator {
  private readonly config: ResolvedAntiSpamConfig;
  private readonly userStates = new Map<string, UserSpamState>();

  constructor(config: AntiSpamConfig = {}) {
    this.config = {
      cooldownSeconds: config.cooldownSeconds ?? 60,
      similarityThreshold: config.similarityThreshold ?? 0.8,
      minContentLength: config.minContentLength ?? 5,
      historyDepth: config.historyDepth ?? 3,
      burstIntervalVarianceMinMs: config.burstIntervalVarianceMinMs ?? 100,
      burstThresholdCount: config.burstThresholdCount ?? 5,
      shadowCooldownMs: config.shadowCooldownMs ?? 30 * 60 * 1000,
    };
  }

  /**
   * Generates a composite cache key for user in guild.
   */
  private getKey(userId: string, guildId?: string): string {
    return `${userId}:${guildId ?? 'global'}`;
  }

  /**
   * Retrieves or initializes the spam state for a user.
   */
  private getState(key: string): UserSpamState {
    let state = this.userStates.get(key);
    if (!state) {
      state = {
        lastRewardAt: 0,
        recentMessages: [],
        shadowCooldownUntil: 0,
      };
      this.userStates.set(key, state);
    }
    return state;
  }

  /**
   * Evaluates a message against all anti-spam criteria.
   */
  public evaluateMessage(
    userId: string,
    guildId: string | undefined,
    content: string,
    timestamp?: number,
  ): AntiSpamEvaluation {
    const now = timestamp ?? Date.now();
    const key = this.getKey(userId, guildId);
    const state = this.getState(key);

    // 1. Check shadow cooldown
    if (now < state.shadowCooldownUntil) {
      const remainingSeconds = Math.ceil((state.shadowCooldownUntil - now) / 1000);
      return {
        isAllowed: false,
        reason: 'SHADOW_COOLDOWN',
        details: `Account under shadow cooldown (${remainingSeconds}s remaining)`,
      };
    }

    // 2. Minimum length & quality threshold
    const cleaned = content.trim().replace(/\s+/g, ' ');
    if (cleaned.length < this.config.minContentLength) {
      return {
        isAllowed: false,
        reason: 'MIN_LENGTH',
        details: `Message length ${cleaned.length} is below minimum threshold ${this.config.minContentLength}`,
      };
    }

    // 3. Record message into history for burst & variance analysis
    const normalized = cleaned.toLowerCase();
    state.recentMessages.push({ content: normalized, timestamp: now });
    // Keep at most 10 recent messages in memory
    if (state.recentMessages.length > 10) {
      state.recentMessages.splice(0, state.recentMessages.length - 10);
    }

    // 4. Automated burst and low-variance check
    if (state.recentMessages.length >= this.config.burstThresholdCount) {
      const recentBurst = state.recentMessages.slice(-this.config.burstThresholdCount);
      const firstBurst = recentBurst[0];

      // If burst count reached within 10 seconds
      if (firstBurst && now - firstBurst.timestamp <= 10_000) {
        const intervals: number[] = [];
        for (let i = 1; i < recentBurst.length; i++) {
          const prevMsg = recentBurst[i - 1];
          const currMsg = recentBurst[i];
          if (prevMsg && currMsg) {
            intervals.push(currMsg.timestamp - prevMsg.timestamp);
          }
        }

        if (intervals.length > 0) {
          const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
          const variance =
            intervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / intervals.length;

          // Inhumanly consistent intervals (< 100ms variance)
          if (variance < this.config.burstIntervalVarianceMinMs) {
            state.shadowCooldownUntil = now + this.config.shadowCooldownMs;
            return {
              isAllowed: false,
              reason: 'AUTOMATED_BURST',
              details: `Inhuman interval variance detected (${variance.toFixed(1)}ms). Triggered 30m shadow cooldown.`,
            };
          }
        }
      }
    }

    // 5. Rolling window cooldown check
    const elapsedSinceLastReward = now - state.lastRewardAt;
    const cooldownMs = this.config.cooldownSeconds * 1000;
    if (state.lastRewardAt > 0 && elapsedSinceLastReward < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - elapsedSinceLastReward) / 1000);
      return {
        isAllowed: false,
        reason: 'COOLDOWN',
        details: `Reward cooldown active (${remainingSeconds}s remaining)`,
      };
    }

    // 6. Similarity & copy-paste filter (compare against previous 3 messages excluding current)
    const historySlice = state.recentMessages.slice(-this.config.historyDepth - 1, -1);
    for (const prev of historySlice) {
      const sim = calculateSimilarity(normalized, prev.content);
      if (sim >= this.config.similarityThreshold) {
        return {
          isAllowed: false,
          reason: 'SIMILARITY_EXCEEDED',
          details: `Message is ${(sim * 100).toFixed(1)}% similar to a recent message (threshold: ${(this.config.similarityThreshold * 100).toFixed(1)}%)`,
        };
      }
    }

    // All anti-spam checks passed: update reward timestamp
    state.lastRewardAt = now;
    return {
      isAllowed: true,
    };
  }

  /**
   * Clears state for testing or user resets.
   */
  public reset(userId?: string, guildId?: string): void {
    if (userId) {
      this.userStates.delete(this.getKey(userId, guildId));
    } else {
      this.userStates.clear();
    }
  }

  /**
   * Sweeps stale user state entries to prevent unbounded memory growth.
   */
  public sweep(maxAgeMs = 3600_000): number {
    const now = Date.now();
    let swept = 0;
    for (const [key, state] of this.userStates.entries()) {
      const isStaleReward = now - state.lastRewardAt > maxAgeMs;
      const isShadowExpired = now > state.shadowCooldownUntil;
      if (isStaleReward && isShadowExpired) {
        this.userStates.delete(key);
        swept++;
      }
    }
    return swept;
  }
}
