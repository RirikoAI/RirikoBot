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

  it('sanitizes dotted tool names for OpenAI schema and restores original tool names', async () => {
    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_reminder1',
                type: 'function',
                function: {
                  name: 'reminders_create',
                  arguments: JSON.stringify({ timeString: '10m', message: 'Take pizza out' }),
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
      messages: [{ role: 'user', content: 'Remind me in 10m to take pizza out' }],
      tools: [
        {
          name: 'reminders.create',
          description: 'Create reminder',
          parameters: { type: 'object' },
        },
      ],
    });

    // Verify call to OpenAI passed sanitized name
    expect(mockCreateChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            function: expect.objectContaining({
              name: 'reminders_create',
            }),
          }),
        ],
      }),
    );

    // Verify returned tool call restored original dotted name
    expect(response.toolCalls?.[0]?.name).toBe('reminders.create');
    expect(response.toolCalls?.[0]?.arguments).toEqual({ timeString: '10m', message: 'Take pizza out' });
  });

  it('omits unresponded assistant tool calls in historical context to prevent OpenAI 400 error', async () => {
    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'The capital of Japan is Tokyo.',
            tool_calls: null,
          },
          finish_reason: 'stop',
        },
      ],
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const response = await provider.generate({
      messages: [
        { role: 'user', content: 'What time is it?' },
        {
          role: 'assistant',
          content: '🔧 *[get_current_time]*: 4:40 PM',
          toolCalls: [
            { id: 'call_pYEEnFAui9JdsgyhFi8DvC66', name: 'get_current_time', arguments: {} },
            { id: 'call_OdQvaRsnbzWkdlA7OMFP3Cu3', name: 'get_current_time', arguments: {} },
          ],
        },
        { role: 'user', content: 'What is the capital of Japan?' },
      ],
    });

    expect(response.content).toBe('The capital of Japan is Tokyo.');
    // Verify that the assistant message sent to OpenAI did NOT include unresponded tool_calls
    expect(mockCreateChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'What time is it?' },
          { role: 'assistant', content: '🔧 *[get_current_time]*: 4:40 PM' },
          { role: 'user', content: 'What is the capital of Japan?' },
        ],
      }),
    );
  });

  it('preserves assistant tool calls when corresponding tool response messages exist', async () => {
    mockCreateChatCompletion.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: 'It is 4:40 PM in Tokyo.',
            tool_calls: null,
          },
          finish_reason: 'stop',
        },
      ],
    });

    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    await provider.generate({
      messages: [
        { role: 'user', content: 'What time is it in Tokyo?' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'call_123', name: 'get_current_time', arguments: { timezone: 'Asia/Tokyo' } },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call_123',
          content: JSON.stringify({ time: '4:40 PM' }),
        },
      ],
    });

    expect(mockCreateChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'What time is it in Tokyo?' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'get_current_time',
                  arguments: JSON.stringify({ timezone: 'Asia/Tokyo' }),
                },
              },
            ],
          },
          {
            role: 'tool',
            tool_call_id: 'call_123',
            content: JSON.stringify({ time: '4:40 PM' }),
          },
        ],
      }),
    );
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
