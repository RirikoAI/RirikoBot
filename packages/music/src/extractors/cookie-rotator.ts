export interface CookieEntry {
  id: string;
  cookie: string;
  failureCount: number;
  lastUsedAt?: Date | undefined;
  quarantinedUntil?: Date | undefined;
}

export interface CookieRotatorOptions {
  maxFailuresBeforeQuarantine?: number | undefined;
  quarantineDurationMs?: number | undefined;
}

/**
 * CookieRotator manages a pool of session cookies for anti-bot evasion.
 * Employs round-robin rotation with quarantine backoff upon repeated failures.
 */
export class CookieRotator {
  private readonly entries: CookieEntry[] = [];
  private currentIndex = 0;
  private readonly maxFailures: number;
  private readonly quarantineDurationMs: number;

  constructor(cookies: string[] = [], options: CookieRotatorOptions = {}) {
    this.maxFailures = options.maxFailuresBeforeQuarantine ?? 3;
    this.quarantineDurationMs = options.quarantineDurationMs ?? 300_000; // 5 minutes

    for (const cookie of cookies) {
      this.addCookie(cookie);
    }
  }

  addCookie(cookie: string): string {
    const clean = cookie.trim();
    if (!clean) throw new Error('Cannot add empty cookie string.');

    const id = `cookie_${Buffer.from(clean).toString('hex').slice(0, 8)}`;
    const existing = this.entries.find((e) => e.cookie === clean);
    if (existing) return existing.id;

    this.entries.push({
      id,
      cookie: clean,
      failureCount: 0,
    });
    return id;
  }

  removeCookie(id: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx !== -1) {
      this.entries.splice(idx, 1);
      if (this.currentIndex >= this.entries.length) {
        this.currentIndex = 0;
      }
      return true;
    }
    return false;
  }

  /**
   * Retrieves the next available, non-quarantined cookie using round-robin.
   */
  getNextCookie(): string | null {
    if (this.entries.length === 0) return null;

    const now = new Date();
    const total = this.entries.length;

    for (let i = 0; i < total; i++) {
      const idx = (this.currentIndex + i) % total;
      const entry = this.entries[idx]!;

      // Check if quarantine has expired
      if (entry.quarantinedUntil && entry.quarantinedUntil <= now) {
        entry.quarantinedUntil = undefined;
        entry.failureCount = 0;
      }

      if (!entry.quarantinedUntil) {
        this.currentIndex = (idx + 1) % total;
        entry.lastUsedAt = now;
        return entry.cookie;
      }
    }

    // All cookies are currently quarantined; fallback to the earliest unquarantine candidate
    return null;
  }

  reportSuccess(cookie: string): void {
    const entry = this.entries.find((e) => e.cookie === cookie);
    if (entry) {
      entry.failureCount = 0;
      entry.quarantinedUntil = undefined;
    }
  }

  reportFailure(cookie: string): void {
    const entry = this.entries.find((e) => e.cookie === cookie);
    if (entry) {
      entry.failureCount += 1;
      if (entry.failureCount >= this.maxFailures) {
        entry.quarantinedUntil = new Date(Date.now() + this.quarantineDurationMs);
      }
    }
  }

  getStats(): { total: number; active: number; quarantined: number } {
    const now = new Date();
    let active = 0;
    let quarantined = 0;

    for (const entry of this.entries) {
      if (entry.quarantinedUntil && entry.quarantinedUntil > now) {
        quarantined++;
      } else {
        active++;
      }
    }

    return {
      total: this.entries.length,
      active,
      quarantined,
    };
  }
}
