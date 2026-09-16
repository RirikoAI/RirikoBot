import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FallbackChainManager } from './fallback-chain-manager.js';
import {
  ChatModelProvider,
  ChatRequest,
  ChatResponse,
  ChatToken,
} from '../types/index.js';
import { AiProviderExhaustionError, AiRateLimitError } from '../errors/index.js';

function createMockProvider(overrides: Partial<ChatModelProvider> & { id: string }): ChatModelProvider {
  return {
    name: overrides.id.toUpperCase(),
    isAvailable: true,
    supportedModels: ['mock-model-1', 'mock-model-2'],
    defaultModel: 'mock-model-1',
    generate: vi.fn().mockResolvedValue({
      content: `Response from ${overrides.id}`,
      model: 'mock-model-1',
      provider: overrides.id,
    } satisfies ChatResponse),
    stream: vi.fn().mockImplementation(async function* () {
      yield { text: `Chunk from ${overrides.id}`, isFinished: true } satisfies ChatToken;
    }),
    ...overrides,
  };
}

describe('FallbackChainManager', () => {
  let primaryProvider: ChatModelProvider;
  let secondaryProvider: ChatModelProvider;
  let tertiaryProvider: ChatModelProvider;
  let manager: FallbackChainManager;

  const mockRequest: ChatRequest = {
    messages: [{ role: 'user', content: 'Hello world' }],
  };

  beforeEach(() => {
    primaryProvider = createMockProvider({ id: 'gemini' });
    secondaryProvider = createMockProvider({ id: 'openai' });
    tertiaryProvider = createMockProvider({ id: 'ollama' });

    manager = new FallbackChainManager([primaryProvider, secondaryProvider, tertiaryProvider], {
      defaultCooldownMs: 10_000,
      maxConsecutiveFailures: 2,
    });
  });

  it('registers and retrieves providers', () => {
    expect(manager.getProvider('gemini')).toBe(primaryProvider);
    expect(manager.getProvider('openai')).toBe(secondaryProvider);
    expect(manager.getProvider('unknown')).toBeUndefined();
    expect(manager.getAllProviders()).toHaveLength(3);
  });

  it('generates response from primary provider when healthy', async () => {
    const res = await manager.generate(mockRequest);
    expect(res.provider).toBe('gemini');
    expect(res.content).toBe('Response from gemini');
    expect(primaryProvider.generate).toHaveBeenCalledTimes(1);
    expect(secondaryProvider.generate).not.toHaveBeenCalled();
  });

  it('respects preferredProviderId and routes directly to it', async () => {
    const res = await manager.generate(mockRequest, 'openai');
    expect(res.provider).toBe('openai');
    expect(secondaryProvider.generate).toHaveBeenCalledTimes(1);
    expect(primaryProvider.generate).not.toHaveBeenCalled();
  });

  it('transparently falls back to secondary provider when primary throws error', async () => {
    vi.mocked(primaryProvider.generate).mockRejectedValueOnce(new Error('Gemini connection reset'));

    const res = await manager.generate(mockRequest);
    expect(res.provider).toBe('openai');
    expect(primaryProvider.generate).toHaveBeenCalledTimes(1);
    expect(secondaryProvider.generate).toHaveBeenCalledTimes(1);
  });

  it('places provider in cooldown on rate limit (429) and skips on next call', async () => {
    vi.mocked(primaryProvider.generate).mockRejectedValueOnce(
      new AiRateLimitError('gemini', { message: 'Quota exceeded', retryAfterMs: 5000 }),
    );

    // First call: primary fails with 429, falls back to secondary
    const res1 = await manager.generate(mockRequest);
    expect(res1.provider).toBe('openai');

    // Verify primary is in cooldown
    const status = manager.getProviderStatus('gemini');
    expect(status.isInCooldown).toBe(true);
    expect(status.cooldownRemainingMs).toBeGreaterThan(0);

    // Second call: primary is skipped immediately due to cooldown, goes straight to secondary
    vi.clearAllMocks();
    const res2 = await manager.generate(mockRequest);
    expect(res2.provider).toBe('openai');
    expect(primaryProvider.generate).not.toHaveBeenCalled();
    expect(secondaryProvider.generate).toHaveBeenCalledTimes(1);
  });

  it('re-enables provider once cooldown expires or is reset', async () => {
    vi.mocked(primaryProvider.generate).mockRejectedValueOnce(
      new AiRateLimitError('gemini', { message: 'Quota exceeded', retryAfterMs: 1000 }),
    );

    await manager.generate(mockRequest);
    expect(manager.isProviderInCooldown('gemini')).toBe(true);

    manager.resetCooldown('gemini');
    expect(manager.isProviderInCooldown('gemini')).toBe(false);

    // Now primary is attempted again
    const res = await manager.generate(mockRequest);
    expect(res.provider).toBe('gemini');
  });

  it('skips disabled/unavailable providers', async () => {
    const disabledProvider = createMockProvider({ id: 'disabled', isAvailable: false });
    manager.registerProvider(disabledProvider);

    const candidates = manager.getCandidateProviders();
    expect(candidates.find((c) => c.id === 'disabled')).toBeUndefined();
  });

  it('throws AiProviderExhaustionError when all providers fail', async () => {
    vi.mocked(primaryProvider.generate).mockRejectedValue(new Error('Gemini down'));
    vi.mocked(secondaryProvider.generate).mockRejectedValue(new Error('OpenAI 503'));
    vi.mocked(tertiaryProvider.generate).mockRejectedValue(new Error('Ollama connection refused'));

    await expect(manager.generate(mockRequest)).rejects.toThrow(AiProviderExhaustionError);

    try {
      await manager.generate(mockRequest);
    } catch (err: unknown) {
      const exhaustionErr = err as AiProviderExhaustionError;
      expect(exhaustionErr.failures).toHaveLength(3);
      expect(exhaustionErr.failures[0]?.providerId).toBe('gemini');
      expect(exhaustionErr.failures[1]?.providerId).toBe('openai');
      expect(exhaustionErr.failures[2]?.providerId).toBe('ollama');
      expect(exhaustionErr.statusCode).toBe(503);
    }
  });

  describe('streaming fallback', () => {
    it('streams tokens from primary provider when healthy', async () => {
      const tokens: ChatToken[] = [];
      for await (const token of manager.stream(mockRequest)) {
        tokens.push(token);
      }
      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.text).toBe('Chunk from gemini');
      expect(primaryProvider.stream).toHaveBeenCalledTimes(1);
    });

    it('falls back to secondary provider if primary fails before first token', async () => {
      // eslint-disable-next-line require-yield
      vi.mocked(primaryProvider.stream!).mockImplementationOnce(async function* () {
        throw new Error('Gemini stream handshake failed');
      });

      const tokens: ChatToken[] = [];
      for await (const token of manager.stream(mockRequest)) {
        tokens.push(token);
      }

      expect(tokens).toHaveLength(1);
      expect(tokens[0]?.text).toBe('Chunk from openai');
      expect(primaryProvider.stream).toHaveBeenCalledTimes(1);
      expect(secondaryProvider.stream).toHaveBeenCalledTimes(1);
    });

    it('propagates error if stream fails after tokens were already emitted', async () => {
      vi.mocked(primaryProvider.stream!).mockImplementationOnce(async function* () {
        yield { text: 'Initial chunk', isFinished: false };
        throw new Error('Connection severed mid-stream');
      });

      const streamIterator = manager.stream(mockRequest);
      const first = await streamIterator[Symbol.asyncIterator]().next();
      expect(first.value?.text).toBe('Initial chunk');

      await expect(streamIterator[Symbol.asyncIterator]().next()).rejects.toThrow(
        'Connection severed mid-stream',
      );
      // Secondary should not have been called mid-stream
      expect(secondaryProvider.stream).not.toHaveBeenCalled();
    });
  });
});
