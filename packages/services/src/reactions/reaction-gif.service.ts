import { getReaction } from './reactions.catalog.js';
import { OtakuGifsClient } from './otakugifs.client.js';

interface PoolEntry {
  readonly url: string;
  readonly fetchedAt: number;
}

export interface ReactionGifResult {
  readonly url: string;
  /**
   * True when this URL was served from the offline-fallback path (the API call failed and this
   * came from a TTL-expired pool entry) rather than a fresh fetch or a warm cache hit.
   */
  readonly stale: boolean;
}

export interface ReactionGifServiceOptions {
  client?: OtakuGifsClient;
  /** How long a cached URL counts as "fresh" before it only serves as offline fallback. Default 30 min. */
  ttlMs?: number;
  /** Fresh-URL count at/above which the pool is "warm" and served without a network call. Default 5. */
  minWarmSize?: number;
  /** Cap on URLs retained per reaction (fresh + stale), oldest evicted first. Default 20. */
  maxPoolSize?: number;
  now?: () => number;
  /** Injectable RNG in [0, 1) for deterministic tests. Default Math.random. */
  random?: () => number;
}

/**
 * Serves reaction GIF URLs backed by a per-reaction, in-memory URL pool fed by OtakuGifsClient.
 *
 * Policy (deliberately simple — no scheduler, no broker):
 *  - Every fetched URL is appended to that reaction's pool with a timestamp, capped at
 *    `maxPoolSize` (oldest evicted first) so memory never grows unbounded across a 68-reaction
 *    catalog.
 *  - A pool counts as "warm" once it holds at least `minWarmSize` URLs fetched within the last
 *    `ttlMs`. A warm pool serves a random fresh URL immediately (no network call) and, if the
 *    fresh count is still below `maxPoolSize`, kicks off a fire-and-forget top-up fetch in the
 *    background so the pool keeps refilling without blocking the caller.
 *  - A cold pool (below `minWarmSize` fresh URLs) fetches synchronously ("on miss").
 *  - Offline fallback: if that fetch fails, any still-cached URL for the reaction — even past
 *    its TTL — is served instead (`stale: true`), so the command keeps working through an
 *    otakugifs.xyz outage. Only when the pool is completely empty does this resolve to `null`,
 *    which the command layer renders as legacy's "use your imagination" embed.
 *  - This service never throws for an upstream failure; a failure either falls back to a stale
 *    URL or resolves to `null`.
 */
export class ReactionGifService {
  private readonly client: OtakuGifsClient;
  private readonly ttlMs: number;
  private readonly minWarmSize: number;
  private readonly maxPoolSize: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly pools = new Map<string, PoolEntry[]>();
  /** Prevents overlapping background top-ups for the same reaction. */
  private readonly refilling = new Set<string>();

  constructor(options: ReactionGifServiceOptions = {}) {
    this.client = options.client ?? new OtakuGifsClient();
    this.ttlMs = options.ttlMs ?? 30 * 60 * 1000;
    this.minWarmSize = options.minWarmSize ?? 5;
    this.maxPoolSize = options.maxPoolSize ?? 20;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  /**
   * Resolves a GIF URL for the given catalog reaction name. Returns `null` only when the
   * reaction is unknown, or the pool is empty and the live fetch also failed.
   */
  async getGifUrl(reactionName: string): Promise<ReactionGifResult | null> {
    const reaction = getReaction(reactionName);
    if (!reaction) {
      return null;
    }

    const key = reaction.reactionType;
    const now = this.now();
    const pool = this.pools.get(key) ?? [];
    const fresh = pool.filter((entry) => now - entry.fetchedAt < this.ttlMs);

    if (fresh.length >= this.minWarmSize) {
      if (fresh.length < this.maxPoolSize) {
        this.backgroundRefill(reaction.name, key);
      }
      return { url: this.pick(fresh).url, stale: false };
    }

    try {
      const url = await this.client.fetchGifUrl(reaction.name);
      this.addToPool(key, url, now);
      return { url, stale: false };
    } catch {
      if (pool.length > 0) {
        return { url: this.pick(pool).url, stale: true };
      }
      return null;
    }
  }

  private backgroundRefill(reactionName: string, key: string): void {
    if (this.refilling.has(key)) return;
    this.refilling.add(key);
    void this.client
      .fetchGifUrl(reactionName)
      .then((url) => this.addToPool(key, url, this.now()))
      .catch(() => {
        // Best-effort top-up; a failure here just leaves the pool as-is.
      })
      .finally(() => {
        this.refilling.delete(key);
      });
  }

  private addToPool(key: string, url: string, fetchedAt: number): void {
    const pool = this.pools.get(key) ?? [];
    pool.push({ url, fetchedAt });
    while (pool.length > this.maxPoolSize) {
      pool.shift();
    }
    this.pools.set(key, pool);
  }

  private pick(entries: readonly PoolEntry[]): PoolEntry {
    const index = Math.min(entries.length - 1, Math.floor(this.random() * entries.length));
    return entries[Math.max(0, index)]!;
  }
}
