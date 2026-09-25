import 'server-only';
import { clientIp } from './auth/request';

export interface RateLimitOptions {
  /** Requests allowed in a burst. */
  capacity: number;
  /** Tokens added back per second. */
  refillPerSecond: number;
  now?: () => number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/** Buckets are pruned once there are this many, dropping those that have refilled. */
const PRUNE_THRESHOLD = 10_000;

/**
 * In-process token bucket per key. Enough for a single dashboard instance (ADR-013); a
 * scaled-out dashboard would need a shared store such as the database.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(private readonly options: RateLimitOptions) {
    this.now = options.now ?? Date.now;
  }

  /** Takes one token for `key`; false when its bucket is empty. */
  take(key: string): boolean {
    const now = this.now();
    const tokens = this.tokensAt(this.buckets.get(key), now);
    const allowed = tokens >= 1;
    this.buckets.set(key, { tokens: allowed ? tokens - 1 : tokens, updatedAt: now });
    if (this.buckets.size > PRUNE_THRESHOLD) this.prune(now);
    return allowed;
  }

  private tokensAt(bucket: Bucket | undefined, now: number): number {
    if (!bucket) return this.options.capacity;
    const refilled = ((now - bucket.updatedAt) / 1000) * this.options.refillPerSecond;
    return Math.min(this.options.capacity, bucket.tokens + refilled);
  }

  /** A full bucket behaves exactly like a missing one, so it can be dropped. */
  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (this.tokensAt(bucket, now) >= this.options.capacity) this.buckets.delete(key);
    }
  }
}

const globalForLimits = globalThis as typeof globalThis & {
  __ririkoRateLimits?: { auth: RateLimiter; actions: RateLimiter };
};

/**
 * Shared limiters, kept on globalThis so dev-mode module reloads keep their state. Sign-in takes
 * two auth requests (login and callback), so 20 per IP allows a few retries per minute.
 */
export const rateLimits = (globalForLimits.__ririkoRateLimits ??= {
  /** Auth route handlers, keyed by client IP. */
  auth: new RateLimiter({ capacity: 20, refillPerSecond: 20 / 60 }),
  /** Server Actions, keyed by user ID (or client IP before sign-in). */
  actions: new RateLimiter({ capacity: 30, refillPerSecond: 1 }),
});

/** First check in every auth route handler: a 429 response when the client IP is over its limit. */
export function limitAuthRequest(request: Request): Response | null {
  if (rateLimits.auth.take(`ip:${clientIp(request.headers) ?? 'unknown'}`)) return null;
  return new Response('Too many requests. Wait a minute, then try again.', {
    status: 429,
    headers: { 'Retry-After': '60', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
