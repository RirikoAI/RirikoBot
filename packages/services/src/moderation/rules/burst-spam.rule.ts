import type {
  AutoModRule,
  AutoModRuleConfig,
  ModerationContext,
  RuleEvaluationResult,
} from '../automod.types.js';

interface UserSpamEntry {
  timestamps: number[];
  recentMessages: Array<{ content: string; timestamp: number }>;
  lastSeen: number;
}

export class BurstSpamRule implements AutoModRule {
  readonly ruleType = 'BURST_SPAM' as const;
  readonly name = 'Burst & Duplicate Spam Detector';

  private static readonly DEFAULT_THRESHOLD = 5;
  private static readonly DEFAULT_WINDOW_MS = 3000;
  private static readonly DUPLICATE_THRESHOLD = 3;
  private static readonly DUPLICATE_WINDOW_MS = 10000;
  private static readonly TTL_CLEANUP_MS = 60000;

  private readonly userHistory = new Map<string, UserSpamEntry>();
  private lastCleanupTime = Date.now();

  /**
   * Cleans up stale entries older than 60 seconds to prevent memory leaks.
   */
  public cleanup(now = Date.now()): void {
    for (const [key, entry] of this.userHistory.entries()) {
      if (now - entry.lastSeen > BurstSpamRule.TTL_CLEANUP_MS) {
        this.userHistory.delete(key);
      }
    }
    this.lastCleanupTime = now;
  }

  /**
   * Resets history for a user, a guild, or all guilds (useful for unit tests and unbans).
   */
  public reset(guildId?: string, userId?: string): void {
    if (!guildId && !userId) {
      this.userHistory.clear();
      return;
    }

    if (guildId && userId) {
      this.userHistory.delete(`${guildId}:${userId}`);
      return;
    }

    if (guildId) {
      for (const key of this.userHistory.keys()) {
        if (key.startsWith(`${guildId}:`)) {
          this.userHistory.delete(key);
        }
      }
    }
  }

  async evaluate(
    context: ModerationContext,
    config?: AutoModRuleConfig,
  ): Promise<RuleEvaluationResult> {
    const now = context.createdTimestamp ?? Date.now();
    const threshold = config?.threshold ?? BurstSpamRule.DEFAULT_THRESHOLD;
    const windowMs = BurstSpamRule.DEFAULT_WINDOW_MS;
    const key = `${context.guildId}:${context.userId}`;

    // Periodic cleanup check
    if (now - this.lastCleanupTime > BurstSpamRule.TTL_CLEANUP_MS) {
      this.cleanup(now);
    }

    let entry = this.userHistory.get(key);
    if (!entry) {
      entry = {
        timestamps: [],
        recentMessages: [],
        lastSeen: now,
      };
      this.userHistory.set(key, entry);
    }

    entry.lastSeen = now;

    // 1. Sliding window velocity check: keep only timestamps within window
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);
    entry.timestamps.push(now);

    if (entry.timestamps.length > threshold) {
      return {
        matched: true,
        ruleType: this.ruleType,
        action: config?.action ?? 'DELETE',
        reason: `Message velocity spam detected (${entry.timestamps.length} messages in ${windowMs / 1000}s, limit is ${threshold})`,
        metadata: {
          velocityCount: entry.timestamps.length,
          threshold,
          windowMs,
          detectionType: 'BURST_VELOCITY',
        },
      };
    }

    // 2. Duplicate message check: keep messages within duplicate window
    const normalizedContent = (context.content ?? '').trim().toLowerCase();
    if (normalizedContent.length > 0) {
      entry.recentMessages = entry.recentMessages.filter(
        (msg) => now - msg.timestamp < BurstSpamRule.DUPLICATE_WINDOW_MS,
      );
      entry.recentMessages.push({ content: normalizedContent, timestamp: now });

      const duplicateCount = entry.recentMessages.filter(
        (msg) => msg.content === normalizedContent,
      ).length;

      if (duplicateCount >= BurstSpamRule.DUPLICATE_THRESHOLD) {
        return {
          matched: true,
          ruleType: this.ruleType,
          action: config?.action ?? 'DELETE',
          reason: `Repeated duplicate message spam detected (${duplicateCount} identical messages within ${BurstSpamRule.DUPLICATE_WINDOW_MS / 1000}s)`,
          metadata: {
            duplicateCount,
            threshold: BurstSpamRule.DUPLICATE_THRESHOLD,
            detectionType: 'DUPLICATE_SPAM',
          },
        };
      }
    }

    return {
      matched: false,
      ruleType: this.ruleType,
      action: 'ALLOW',
      metadata: {
        recentCount: entry.timestamps.length,
      },
    };
  }
}
