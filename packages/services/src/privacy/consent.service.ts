import type { UserConsentRepository, UserConsentKind } from '@ririko/database';

/** "Last updated" date of the Terms of Service and the Privacy Policy (docs/legal). */
export const LEGAL_DOCUMENTS_DATE = '2026-10-22';

/** The version of the terms notice. Raise it when the terms or the policy change in substance. */
export const TERMS_VERSION = LEGAL_DOCUMENTS_DATE;

/**
 * The version of the AI consent. Its own date, not LEGAL_DOCUMENTS_DATE: it changes only when the
 * AI providers or what they receive change.
 */
export const AI_CONSENT_VERSION = '2026-10-15';

const CURRENT_VERSIONS: Readonly<Record<UserConsentKind, string>> = {
  terms: TERMS_VERSION,
  ai: AI_CONSENT_VERSION,
};

export interface ConsentServiceOptions {
  /** Clock for `acceptedAt`. Defaults to the system clock. */
  now?: () => Date;
  /** Accepted users kept in memory before the cache starts over. */
  maxCachedUsers?: number;
}

/**
 * Knows which version of each notice or consent is current and whether a user accepted it.
 * Users who accepted the current version are remembered in memory, so a command costs at most
 * one database read per user per process. Only an acceptance is cached: a user who has not
 * accepted is read again until they do.
 */
export class ConsentService {
  private readonly now: () => Date;
  private readonly maxCached: number;
  private accepted = new Set<string>();

  constructor(
    private readonly repo: Pick<UserConsentRepository, 'find' | 'accept' | 'withdraw'>,
    options: ConsentServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxCached = options.maxCachedUsers ?? 50_000;
  }

  /** The current version of `kind`. */
  versionOf(kind: UserConsentKind): string {
    return CURRENT_VERSIONS[kind];
  }

  /** True only when the user accepted the current version of `kind`. */
  async hasAccepted(userId: string, kind: UserConsentKind): Promise<boolean> {
    const key = this.cacheKey(userId, kind);
    if (this.accepted.has(key)) return true;
    const row = await this.repo.find(userId, kind);
    if (row?.version !== this.versionOf(kind)) return false;
    this.remember(key);
    return true;
  }

  /**
   * What the user accepted of `kind` and when, read from the database. Null when they never
   * accepted it or withdrew. `current` is false for an older version, which no longer counts.
   */
  async status(
    userId: string,
    kind: UserConsentKind,
  ): Promise<{ version: string; acceptedAt: Date; current: boolean } | null> {
    const row = await this.repo.find(userId, kind);
    if (!row) return null;
    return {
      version: row.version,
      acceptedAt: row.acceptedAt,
      current: row.version === this.versionOf(kind),
    };
  }

  /** Records that the user accepted the current version of `kind`. */
  async accept(userId: string, kind: UserConsentKind): Promise<void> {
    await this.repo.accept(userId, kind, this.versionOf(kind), this.now());
    this.remember(this.cacheKey(userId, kind));
  }

  /** Removes the user's record of `kind`; returns true when there was one. */
  async withdraw(userId: string, kind: UserConsentKind): Promise<boolean> {
    this.accepted.delete(this.cacheKey(userId, kind));
    return this.repo.withdraw(userId, kind);
  }

  private cacheKey(userId: string, kind: UserConsentKind): string {
    return `${userId}:${kind}:${this.versionOf(kind)}`;
  }

  private remember(key: string): void {
    if (this.accepted.size >= this.maxCached) this.accepted = new Set();
    this.accepted.add(key);
  }
}
