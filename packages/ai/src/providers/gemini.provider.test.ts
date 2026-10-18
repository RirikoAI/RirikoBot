import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from './gemini.provider.js';
import { AiProviderError, AiRateLimitError } from '../errors/index.js';

// Mock @google/genai module
const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();

vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      public models = {
        generateContent: mockGenerateContent,
        generateContentStream: mockGenerateContentStream,
      };
    },
  };
});

describe('GeminiProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes availability based on API key presence', () => {
    const providerWithKey = new GeminiProvider({ apiKey: 'test-gemini-key' });
    expect(providerWithKey.isAvailable).toBe(true);
    expect(providerWithKey.id).toBe('gemini');
    expect(providerWithKey.name).toBe('Google Gemini');
    expect(providerWithKey.defaultModel).toBe('gemini-2.5-flash');

    const providerWithoutKey = new GeminiProvider({ apiKey: '' });
    expect(providerWithoutKey.isAvailable).toBe(false);
  });

  it('generates text completion with usage metrics', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [{ text: 'Sugoi! Ririko is ready to help!' }],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: {
        promptTokenCount: 15,
        candidatesTokenCount: 10,
        totalTokenCount: 25,
      },
    });

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const response = await provider.generate({
      messages: [{ role: 'user', content: 'Hello!' }],
      systemInstruction: 'You are Ririko.',
    });

    expect(response.content).toBe('Sugoi! Ririko is ready to help!');
    expect(response.model).toBe('gemini-2.5-flash');
    expect(response.provider).toBe('gemini');
    expect(response.finishReason).toBe('stop');
    expect(response.usage?.totalTokens).toBe(25);
  });

  it('parses function tool calls from response parts', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: 'get_current_time',
                  args: { timezone: 'Asia/Tokyo' },
                },
              },
            ],
          },
          finishReason: 'STOP',
        },
      ],
    });

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const response = await provider.generate({
      messages: [{ role: 'user', content: 'What time is it in Tokyo?' }],
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
    expect(response.toolCalls?.[0]?.arguments).toEqual({ timezone: 'Asia/Tokyo' });
    expect(response.finishReason).toBe('tool_calls');
  });

  it('maps 429 quota exhaustion to AiRateLimitError', async () => {
    mockGenerateContent.mockRejectedValueOnce({
      status: 429,
      message: 'Resource has been exhausted (e.g. check quota).',
    });

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Test' }],
      }),
    ).rejects.toThrow(AiRateLimitError);
  });

  it('maps generic API errors to AiProviderError', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('Internal server error'));

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'Test' }],
      }),
    ).rejects.toThrow(AiProviderError);
  });

  it('streams tokens with incremental chunks and finish indicator', async () => {
    mockGenerateContentStream.mockImplementationOnce(async function* () {
      yield {
        candidates: [{ content: { parts: [{ text: 'Hello ' }] } }],
      };
      yield {
        candidates: [{ content: { parts: [{ text: 'world!' }] } }],
      };
    });

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const tokens = [];
    for await (const token of provider.stream({
      messages: [{ role: 'user', content: 'Hello' }],
    })) {
      tokens.push(token);
    }

    expect(tokens).toHaveLength(3);
    expect(tokens[0]?.text).toBe('Hello ');
    expect(tokens[0]?.isFinished).toBe(false);
    expect(tokens[1]?.text).toBe('world!');
    expect(tokens[1]?.isFinished).toBe(false);
    expect(tokens[2]?.text).toBe('');
    expect(tokens[2]?.isFinished).toBe(true);
  });

  it('checks health accurately', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      candidates: [{ content: { parts: [{ text: 'pong' }] } }],
    });

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const health = await provider.checkHealth();
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.models).toContain('gemini-2.5-flash');
  });
});
