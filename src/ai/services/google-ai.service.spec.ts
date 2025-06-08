// src/command/ai/services/__tests__/google-ai.service.test.ts

import { GoogleAIService } from './google-ai.service';
import { PromptType } from '#command/ai/ai.types';

describe('GoogleAIService', () => {
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://test-api.com';
  let service: GoogleAIService;

  // Mock fetch globally
  const mockFetch = jest.fn();
  global.fetch = mockFetch;
  const mockReader = {
    read: jest.fn(),
  };
  const mockTextDecoder = jest.fn();

  beforeEach(() => {
    service = new GoogleAIService(mockApiKey, mockBaseUrl);
    jest.clearAllMocks();
    // Mock TextDecoder
    global.TextDecoder = jest.fn().mockImplementation(() => ({
      decode: mockTextDecoder,
    })) as any;
  });

  describe('chat', () => {
    const mockMessages: PromptType[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];

    it('should handle successful chat stream', async () => {
      const mockChunk = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Response' }],
            },
          },
        ],
      };

      mockReader.read
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode(JSON.stringify(mockChunk)),
        })
        .mockResolvedValueOnce({ done: true });

      mockTextDecoder.mockReturnValue(JSON.stringify(mockChunk));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const results = [];
      for await (const response of service.chat(mockMessages)) {
        results.push(response);
      }

      expect(results).toEqual([
        { content: 'Response', done: false },
        { content: '', done: true },
      ]);
    });

    it('should handle API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      });

      await expect(async () => {
        for await (const _ of service.chat(mockMessages)) {
          // consume iterator
        }
      }).rejects.toThrow('Google AI API error: 400 Bad Request');
    });
  });

  describe('pullModel', () => {
    it('should return cloud-based model status', async () => {
      const results = [];
      for await (const status of service.pullModel('test-model')) {
        results.push(status);
      }

      expect(results).toEqual([
        {
          status:
            'Google AI models are cloud-based. Model test-model is ready to use.',
        },
      ]);
    });
  });

  describe('getAvailableModels', () => {
    it('should return available models', async () => {
      const mockModels = {
        models: [
          {
            name: 'models/gemini-2.0-flash',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels),
      });

      const result = await service.getAvailableModels();
      expect(result).toEqual(['gemini-2.0-flash']);
    });

    it('should return default model on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await service.getAvailableModels();
      expect(result).toEqual(['gemini-2.0-flash']);
    });
  });

  describe('findJsonEnd', () => {
    it('should find end of valid JSON object', async () => {
      const jsonStr = '{"test": "value"}';
      const result = (service as any).findJsonEnd(jsonStr, 0);
      expect(result).toBe(jsonStr.length - 1);
    });

    it('should handle nested objects', async () => {
      const jsonStr = '{"outer": {"inner": "value"}}';
      const result = (service as any).findJsonEnd(jsonStr, 0);
      expect(result).toBe(jsonStr.length - 1);
    });

    it('should handle escaped quotes', async () => {
      const jsonStr = '{"test": "value \\"quoted\\""}';
      const result = (service as any).findJsonEnd(jsonStr, 0);
      expect(result).toBe(jsonStr.length - 1);
    });

    it('should return -1 for incomplete JSON', async () => {
      const jsonStr = '{"test": "value';
      const result = (service as any).findJsonEnd(jsonStr, 0);
      expect(result).toBe(-1);
    });
  });
});
