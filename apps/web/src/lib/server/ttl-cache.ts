import 'server-only';

interface Entry<V> {
  value: Promise<V>;
  expiresAt: number;
}

/**
 * In-process cache with a fixed time to live. Concurrent loads of one key share a single
 * promise, and failed loads are not cached.
 */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, Entry<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: K, load: () => Promise<V>): Promise<V> {
    const now = this.now();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    this.prune(now);
    const value = load();
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    return value;
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
