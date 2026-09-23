import { RateLimiter, fetchWithRetry } from '../http/rate-limiter.js';
import { getReaction } from './reactions.catalog.js';

export interface OtakuGifsClientOptions {
  baseUrl?: string;
  limiter?: RateLimiter;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
}

const USER_AGENT = 'RirikoBot/2.0 (+https://github.com/RirikoAI/RirikoBot)';

/**
 * Thrown when the requested reaction name is not present in `REACTION_CATALOG`. Callers must
 * never see this reach the API layer as an interpolated string; the client validates first.
 */
export class UnknownReactionError extends Error {
  constructor(public readonly requestedName: string) {
    super(`Unknown reaction type: "${requestedName}"`);
    this.name = 'UnknownReactionError';
  }
}

/**
 * REST client for otakugifs.xyz (https://otakugifs.xyz), the API legacy 1.4.0 used for reaction
 * GIFs. Only the single endpoint legacy relied on is implemented:
 * `GET /gif?reaction=<reactionType>&format=gif` -> `{ url: string }`.
 *
 * This does not catch or retry-swallow errors beyond what `fetchWithRetry` already does
 * (network retries, 429/5xx backoff) — an upstream outage surfaces as a thrown Error so the
 * caller (ReactionGifService) can apply its own offline-fallback policy.
 */
export class OtakuGifsClient {
  private readonly baseUrl: string;
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch | undefined;
  private readonly maxRetries: number | undefined;
  private readonly timeoutMs: number;

  constructor(options: OtakuGifsClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://api.otakugifs.xyz').replace(/\/$/, '');
    this.limiter = options.limiter ?? new RateLimiter(250);
    this.fetchFn = options.fetchFn;
    this.maxRetries = options.maxRetries;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  /**
   * Fetches a fresh GIF URL for the given catalog reaction name (e.g. `hug`, not the
   * `reactionType` slug). Validates the name against `REACTION_CATALOG` before touching the
   * network so an unvalidated user string is never interpolated into the request URL.
   */
  async fetchGifUrl(reactionName: string): Promise<string> {
    const reaction = getReaction(reactionName);
    if (!reaction) {
      throw new UnknownReactionError(reactionName);
    }

    const url = `${this.baseUrl}/gif?reaction=${encodeURIComponent(reaction.reactionType)}&format=gif`;
    const res = await fetchWithRetry(
      url,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
      {
        limiter: this.limiter,
        fetchFn: this.fetchFn,
        maxRetries: this.maxRetries,
        timeoutMs: this.timeoutMs,
      },
    );

    if (!res.ok) {
      throw new Error(`otakugifs.xyz request failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as { url?: string };
    if (!body.url) {
      throw new Error('otakugifs.xyz response is missing the "url" field');
    }
    return body.url;
  }
}
