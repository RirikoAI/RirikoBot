import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from './openai.provider.js';
import { AiProviderError, AiRateLimitError } from '../errors/index.js';

// Mock openai module
const mockCreateChatCompletion = vi.fn();
const mockListModels = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      public chat = {
        completions: {
          create: mockCreateChatCompletion,
        },
      };
      public models = {
        list: mockListModels,
      };
    },
  };
});

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes availability based on API key presence', () => {
    const providerWithKey = new OpenAIProvider({ apiKey: 'test-openai-key' });
    expect(providerWithKey.isAvailable).toBe(true);
    expect(providerWithKey.id).toBe('openai');
    expect(providerWithKey.name).toBe('OpenAI');
    expect(providerWithKey.defaultModel).toBe('gpt-4o-mini');

    const providerWithoutKey = new OpenAIProvider({ apiKey: '' });
    expect(providerWithoutKey.isAvailable).toBe(false);
  });

  it('generates text completion with usage metrics', async () => {
    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'Hello! I am GPT-4o-mini ready to assist.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 9,
        total_tokens: 21,
      },
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const response = await provider.generate({
      messages: [{ role: 'user', content: 'Hi' }],
      systemInstruction: 'You are an assistant.',
    });

    expect(response.content).toBe('Hello! I am GPT-4o-mini ready to assist.');
    expect(response.model).toBe('gpt-4o-mini');
    expect(response.provider).toBe('openai');
    expect(response.finishReason).toBe('stop');
    expect(response.usage?.totalTokens).toBe(21);
  });

  it('parses function tool calls from response', async () => {
    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_abc123',
                type: 'function',
                function: {
                  name: 'music_play',
                  arguments: JSON.stringify({ query: 'YOASOBI Idol' }),
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const response = await provider.generate({
      messages: [{ role: 'user', content: 'Play Idol by YOASOBI' }],
      tools: [
        {
          name: 'music_play',
          description: 'Play track',
          parameters: { type: 'object' },
        },
      ],
    });

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls?.[0]?.name).toBe('music_play');
    expect(response.toolCalls?.[0]?.arguments).toEqual({ query: 'YOASOBI Idol' });
    expect(response.finishReason).toBe('tool_calls');
  });

  it('maps 429 quota exhaustion to AiRateLimitError', async () => {
    mockCreateChatCompletion.mockRejectedValueOnce({
      status: 429,
      message: 'Rate limit exceeded: You exceeded your current quota.',
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Test' }],
      }),
    ).rejects.toThrow(AiRateLimitError);
  });

  it('maps generic API errors to AiProviderError', async () => {
    mockCreateChatCompletion.mockRejectedValueOnce(new Error('OpenAI service overloaded 503'));

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Test' }],
      }),
    ).rejects.toThrow(AiProviderError);
  });

  it('streams tokens with incremental delta chunks', async () => {
    mockCreateChatCompletion.mockResolvedValueOnce(
      (async function* () {
        yield {
          choices: [{ delta: { content: 'Streaming ' } }],
        };
        yield {
          choices: [{ delta: { content: 'chunk.' } }],
        };
      })(),
    );

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const tokens = [];
    for await (const token of provider.stream({
      messages: [{ role: 'user', content: 'Stream this' }],
    })) {
      tokens.push(token);
    }

    expect(tokens).toHaveLength(3);
    expect(tokens[0]?.text).toBe('Streaming ');
    expect(tokens[0]?.isFinished).toBe(false);
    expect(tokens[1]?.text).toBe('chunk.');
    expect(tokens[1]?.isFinished).toBe(false);
    expect(tokens[2]?.text).toBe('');
    expect(tokens[2]?.isFinished).toBe(true);
  });

  it('checks health accurately', async () => {
    mockListModels.mockResolvedValueOnce({ data: [{ id: 'gpt-4o' }] });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const health = await provider.checkHealth();
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.models).toContain('gpt-4o-mini');
  });
});
