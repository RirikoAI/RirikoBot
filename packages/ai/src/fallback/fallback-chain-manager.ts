import {
  ChatModelProvider,
  ChatRequest,
  ChatResponse,
  ChatToken,
} from '../types/index.js';
import {
  AiProviderError,
  AiProviderExhaustionError,
  AiRateLimitError,
  ProviderFailureReport,
} from '../errors/index.js';

export interface FallbackChainOptions {
  /** Default cooldown duration in milliseconds when a provider hits a rate limit or 5xx error (default: 60,000ms) */
  defaultCooldownMs?: number;
  /** Max consecutive failures before entering circuit breaker cooldown (default: 3) */
  maxConsecutiveFailures?: number;
}

interface ProviderCircuitState {
  consecutiveFailures: number;
  cooldownUntil: number | null;
  lastError: Error | null;
}

export class FallbackChainManager {
  private readonly providers = new Map<string, ChatModelProvider>();
  private readonly circuitStates = new Map<string, ProviderCircuitState>();
  private readonly defaultCooldownMs: number;
  private readonly maxConsecutiveFailures: number;

  constructor(providers: ChatModelProvider[] = [], options: FallbackChainOptions = {}) {
    this.defaultCooldownMs = options.defaultCooldownMs ?? 60_000;
    this.maxConsecutiveFailures = options.maxConsecutiveFailures ?? 3;

    for (const provider of providers) {
      this.registerProvider(provider);
    }
  }

  public registerProvider(provider: ChatModelProvider): void {
    this.providers.set(provider.id, provider);
    if (!this.circuitStates.has(provider.id)) {
      this.circuitStates.set(provider.id, {
        consecutiveFailures: 0,
        cooldownUntil: null,
        lastError: null,
      });
    }
  }

  public getProvider(id: string): ChatModelProvider | undefined {
    return this.providers.get(id);
  }

  public getAllProviders(): ChatModelProvider[] {
    return Array.from(this.providers.values());
  }

  public isProviderInCooldown(id: string, now: number = Date.now()): boolean {
    const state = this.circuitStates.get(id);
    if (!state || state.cooldownUntil === null) return false;
    if (now >= state.cooldownUntil) {
      // Cooldown expired
      state.cooldownUntil = null;
      state.consecutiveFailures = 0;
      return false;
    }
    return true;
  }

  public getProviderStatus(id: string): {
    isAvailable: boolean;
    isInCooldown: boolean;
    cooldownRemainingMs: number;
    consecutiveFailures: number;
  } {
    const provider = this.providers.get(id);
    const state = this.circuitStates.get(id);
    const now = Date.now();
    const inCooldown = this.isProviderInCooldown(id, now);
    const remainingMs = state?.cooldownUntil ? Math.max(0, state.cooldownUntil - now) : 0;

    return {
      isAvailable: Boolean(provider?.isAvailable),
      isInCooldown: inCooldown,
      cooldownRemainingMs: remainingMs,
      consecutiveFailures: state?.consecutiveFailures ?? 0,
    };
  }

  public recordSuccess(id: string): void {
    const state = this.circuitStates.get(id);
    if (state) {
      state.consecutiveFailures = 0;
      state.cooldownUntil = null;
      state.lastError = null;
    }
  }

  public recordFailure(id: string, error: Error, retryAfterMs?: number): void {
    const state = this.circuitStates.get(id);
    if (!state) return;

    state.consecutiveFailures += 1;
    state.lastError = error;

    const isRateLimit =
      error instanceof AiRateLimitError ||
      (error instanceof AiProviderError && error.externalStatusCode === 429) ||
      error.message.includes('429') ||
      error.message.toLowerCase().includes('quota') ||
      error.message.toLowerCase().includes('rate limit');

    if (isRateLimit || state.consecutiveFailures >= this.maxConsecutiveFailures) {
      const duration = retryAfterMs ?? this.defaultCooldownMs;
      state.cooldownUntil = Date.now() + duration;
    }
  }

  public resetCooldown(id?: string): void {
    if (id) {
      const state = this.circuitStates.get(id);
      if (state) {
        state.consecutiveFailures = 0;
        state.cooldownUntil = null;
        state.lastError = null;
      }
    } else {
      for (const state of this.circuitStates.values()) {
        state.consecutiveFailures = 0;
        state.cooldownUntil = null;
        state.lastError = null;
      }
    }
  }

  /**
   * Builds an ordered list of candidate providers for a request.
   * Preferred provider is evaluated first, followed by others in registration order,
   * skipping providers that are disabled or in cooldown (unless all are in cooldown).
   */
  public getCandidateProviders(preferredProviderId?: string): ChatModelProvider[] {
    const all = Array.from(this.providers.values());
    const available = all.filter((p) => p.isAvailable);

    // Prioritize preferred provider
    const sorted = [...available].sort((a, b) => {
      if (preferredProviderId) {
        if (a.id === preferredProviderId) return -1;
        if (b.id === preferredProviderId) return 1;
      }
      return 0;
    });

    const notInCooldown = sorted.filter((p) => !this.isProviderInCooldown(p.id));
    // If all available providers are in cooldown, fallback to trying them anyway rather than failing immediately
    return notInCooldown.length > 0 ? notInCooldown : sorted;
  }

  /**
   * Generates a completion with automatic fallback across the candidate chain.
   */
  public async generate(
    request: ChatRequest,
    preferredProviderId?: string,
  ): Promise<ChatResponse> {
    const candidates = this.getCandidateProviders(preferredProviderId);
    if (candidates.length === 0) {
      throw new AiProviderExhaustionError([
        {
          providerId: preferredProviderId ?? 'none',
          error: new Error('No AI providers configured or available.'),
        },
      ]);
    }

    const failures: ProviderFailureReport[] = [];

    for (const provider of candidates) {
      try {
        const response = await provider.generate(request);
        this.recordSuccess(provider.id);
        return response;
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        const statusCode = err instanceof AiProviderError ? err.externalStatusCode : undefined;
        const retryAfter = err instanceof AiRateLimitError ? err.retryAfterMs : undefined;

        this.recordFailure(provider.id, error, retryAfter);
        failures.push({
          providerId: provider.id,
          error,
          statusCode,
        });
      }
    }

    throw new AiProviderExhaustionError(failures);
  }

  /**
   * Streams a completion with transparent fallback on initial connection failure.
   */
  public async *stream(
    request: ChatRequest,
    preferredProviderId?: string,
  ): AsyncIterable<ChatToken> {
    const candidates = this.getCandidateProviders(preferredProviderId);
    if (candidates.length === 0) {
      throw new AiProviderExhaustionError([
        {
          providerId: preferredProviderId ?? 'none',
          error: new Error('No AI providers configured or available.'),
        },
      ]);
    }

    const failures: ProviderFailureReport[] = [];

    for (const provider of candidates) {
      if (!provider.stream) {
        continue;
      }

      let hasEmittedToken = false;
      try {
        const tokenStream = provider.stream(request);
        for await (const token of tokenStream) {
          hasEmittedToken = true;
          yield token;
        }
        this.recordSuccess(provider.id);
        return;
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        const statusCode = err instanceof AiProviderError ? err.externalStatusCode : undefined;
        const retryAfter = err instanceof AiRateLimitError ? err.retryAfterMs : undefined;

        this.recordFailure(provider.id, error, retryAfter);
        failures.push({
          providerId: provider.id,
          error,
          statusCode,
        });

        // If we already emitted tokens to the consumer, we cannot cleanly restart from another provider
        if (hasEmittedToken) {
          throw error;
        }
        // Otherwise, fall through to the next candidate provider
      }
    }

    throw new AiProviderExhaustionError(failures);
  }
}
