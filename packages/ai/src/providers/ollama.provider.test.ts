import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from './ollama.provider.js';
import { AiProviderError, AiRateLimitError } from '../errors/index.js';

describe('OllamaProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('initializes default baseURL and models', () => {
    const provider = new OllamaProvider({ baseURL: 'http://127.0.0.1:11434' });
    expect(provider.isAvailable).toBe(true);
    expect(provider.id).toBe('ollama');
    expect(provider.name).toBe('Ollama / Local');
    expect(provider.defaultModel).toBe('llama3.3');
  });

  it('generates text completion with usage metrics via HTTP POST', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        model: 'llama3.3',
        message: {
          role: 'assistant',
          content: 'Local AI response.',
        },
        done: true,
        prompt_eval_count: 8,
        eval_count: 5,
      }),
    } as unknown as Response);

    const provider = new OllamaProvider();
    const response = await provider.generate({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(response.content).toBe('Local AI response.');
    expect(response.model).toBe('llama3.3');
    expect(response.provider).toBe('ollama');
    expect(response.finishReason).toBe('stop');
    expect(response.usage?.totalTokens).toBe(13);
  });

  it('parses function tool calls from Ollama response', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        model: 'llama3.3',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              function: {
                name: 'get_current_time',
                arguments: { timezone: 'UTC' },
              },
            },
          ],
        },
        done: true,
      }),
    } as unknown as Response);

    const provider = new OllamaProvider();
    const response = await provider.generate({
      messages: [{ role: 'user', content: 'What time is it?' }],
      tools: [
        {
          name: 'get_current_time',
          description: 'Get current time',
          parameters: { type: 'object' },
        },
      ],
    });

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls?.[0]?.name).toBe('get_current_time');
    expect(response.toolCalls?.[0]?.arguments).toEqual({ timezone: 'UTC' });
    expect(response.finishReason).toBe('tool_calls');
  });

  it('handles HTTP 429 as AiRateLimitError', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Too many requests',
    } as unknown as Response);

    const provider = new OllamaProvider();
    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Test' }],
      }),
    ).rejects.toThrow(AiRateLimitError);
  });

  it('handles connection failure with retryable AiProviderError', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const provider = new OllamaProvider();
    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Test' }],
      }),
    ).rejects.toThrow(AiProviderError);
  });

  it('streams tokens from NDJSON stream', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('{"message":{"content":"Hello "},"done":false}\n'),
      encoder.encode('{"message":{"content":"Ollama!"},"done":true}\n'),
    ];

    let chunkIndex = 0;
    const mockStream = new ReadableStream({
      pull(controller) {
        if (chunkIndex < chunks.length) {
          controller.enqueue(chunks[chunkIndex++]);
        } else {
          controller.close();
        }
      },
    });

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      body: mockStream,
    } as unknown as Response);

    const provider = new OllamaProvider();
    const tokens = [];
    for await (const token of provider.stream({
      messages: [{ role: 'user', content: 'Stream' }],
    })) {
      tokens.push(token);
    }

    expect(tokens).toHaveLength(3);
    expect(tokens[0]?.text).toBe('Hello ');
    expect(tokens[0]?.isFinished).toBe(false);
    expect(tokens[1]?.text).toBe('Ollama!');
    expect(tokens[1]?.isFinished).toBe(false);
    expect(tokens[2]?.text).toBe('');
    expect(tokens[2]?.isFinished).toBe(true);
  });

  it('checks health by querying tags endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [{ name: 'llama3.3:latest' }, { name: 'mistral:latest' }],
      }),
    } as unknown as Response);

    const provider = new OllamaProvider();
    const health = await provider.checkHealth();
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.models).toContain('llama3.3:latest');
  });
});
