import { OpenAIService } from './openai.service';
import { PromptType } from '#command/ai/ai.types';

describe('OpenAIService', () => {
  let service: OpenAIService;
  const mockApiKey = 'test-api-key';
  const baseUrl = 'https://api.openai.com/v1';

  // Mock fetch globally
  const mockFetch = jest.fn();
  global.fetch = mockFetch;
  const mockReader = {
    read: jest.fn(),
  };
  const mockTextDecoder = jest.fn();

  beforeEach(() => {
    service = new OpenAIService(mockApiKey, baseUrl);
    jest.clearAllMocks();
    // Mock TextDecoder
    global.TextDecoder = jest.fn().mockImplementation(() => ({
      decode: mockTextDecoder,
    })) as any;
  });

  describe('chat', () => {
    const mockMessages: PromptType[] = [{ role: 'user', content: 'Hello' }];

    it('should handle successful streaming response', async () => {
      const mockChunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' World' } }] },
        '[DONE]',
      ];

      let chunkIndex = 0;
      mockTextDecoder.mockImplementation((value) => {
        if (chunkIndex < mockChunks.length) {
          return `data: ${JSON.stringify(mockChunks[chunkIndex++])}\n\n`;
        }
        return '';
      });

      mockReader.read.mockImplementation(() =>
        Promise.resolve({
          done: chunkIndex >= mockChunks.length,
          value: new Uint8Array([1, 2, 3]), // Dummy value
        }),
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const results = [];
      for await (const response of service.chat(mockMessages)) {
        results.push(response);
      }

      expect(results).toEqual([
        { content: 'Hello', done: false },
        { content: ' World', done: false },
        { content: '', done: true },
      ]);
    });

    it('should handle empty delta content', async () => {
      mockTextDecoder.mockReturnValue(
        `data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n`,
      );

      mockReader.read
        .mockResolvedValueOnce({
          done: false,
          value: new Uint8Array([1]),
        })
        .mockResolvedValueOnce({
          done: true,
          value: undefined,
        });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const results = [];
      for await (const response of service.chat(mockMessages)) {
        results.push(response);
      }

      expect(results).toEqual([{ content: '', done: true }]);
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      await expect(async () => {
        for await (const _ of service.chat(mockMessages)) {
          // consume iterator
        }
      }).rejects.toThrow('OpenAI API error: 401 Unauthorized');
    });

    it('should handle malformed JSON in stream', async () => {
      mockTextDecoder.mockReturnValue('data: {invalid-json}\n\n');

      mockReader.read
        .mockResolvedValueOnce({
          done: false,
          value: new Uint8Array([1]),
        })
        .mockResolvedValueOnce({
          done: true,
          value: undefined,
        });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const results = [];
      for await (const response of service.chat(mockMessages)) {
        results.push(response);
      }

      expect(results).toEqual([{ content: '', done: true }]);
    });
  });

  describe('pullModel', () => {
    it('should return cloud-based model status', async () => {
      const modelId = 'test-model';
      const results = [];

      for await (const status of service.pullModel(modelId)) {
        results.push(status);
      }

      expect(results).toEqual([
        {
          status: `OpenAI models are cloud-based. Model ${modelId} is ready to use.`,
        },
      ]);
    });
  });

  describe('getAvailableModels', () => {
    it('should fetch and return available models', async () => {
      const mockResponse = {
        data: [
          { id: 'gpt-4.1-nano' },
          { id: 'gpt-4' },
          { id: 'text-embedding-ada-002' }, // This should be filtered out
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const models = await service.getAvailableModels();
      expect(models).toEqual(['gpt-4.1-nano', 'gpt-4']);
    });

    it('should return default model on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const models = await service.getAvailableModels();
      expect(models).toEqual(['gpt-4.1-nano']);
    });

    it('should return default model on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const models = await service.getAvailableModels();
      expect(models).toEqual(['gpt-4.1-nano']);
    });
  });
});
