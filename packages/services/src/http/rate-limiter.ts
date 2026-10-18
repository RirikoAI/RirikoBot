/**
 * Serializes calls so that consecutive calls start at least `minIntervalMs` apart.
 * One limiter per remote host keeps us inside each API's published rate limit.
 */
export class RateLimiter {
  private readonly minIntervalMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private queue: Promise<unknown> = Promise.resolve();
  private lastStart = Number.NEGATIVE_INFINITY;

  constructor(
    minIntervalMs: number,
    options: { sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
  ) {
    this.minIntervalMs = minIntervalMs;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastStart + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastStart = this.now();
      return task();
    });
    // Keep the chain alive even if this task fails.
    this.queue = run.catch(() => undefined);
    return run;
  }
}

export interface FetchWithRetryOptions {
  limiter: RateLimiter;
  fetchFn?: typeof fetch | undefined;
  maxRetries?: number | undefined;
  baseBackoffMs?: number;
  /** Aborts each attempt after this many ms; an aborted attempt counts as a retryable failure. */
  timeoutMs?: number | undefined;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Rate-limited fetch that retries on 429 (honouring Retry-After), 5xx and network errors with
 * exponential backoff.
 * Other responses (including 4xx) are returned to the caller as-is.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions,
): Promise<Response> {
  const fetchFn = options.fetchFn ?? globalThis.fetch;
  const maxRetries = options.maxRetries ?? 4;
  const baseBackoffMs = options.baseBackoffMs ?? 2000;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  for (let attempt = 0; ; attempt++) {
    let res: Response | undefined;
    let error: unknown;
    try {
      res = await options.limiter.schedule(() =>
        fetchFn(
          url,
          options.timeoutMs === undefined
            ? init
            : { ...init, signal: AbortSignal.timeout(options.timeoutMs) },
        ),
      );
    } catch (err) {
      error = err;
    }

    const retryable = !res || res.status === 429 || res.status >= 500;
    if (!retryable) return res!;
    if (attempt >= maxRetries) {
      if (res) return res;
      throw error;
    }

    const retryAfterSec = Number(res?.headers.get('retry-after'));
    const delay =
      Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : baseBackoffMs * 2 ** attempt;
    await sleep(delay);
  }
}
