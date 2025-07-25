// src/command/ai/services/__tests__/ollama.service.test.ts

import { OllamaService } from './ollama.service';
import { Ollama } from 'ollama';
import { PromptType } from '#command/ai/ai.types';

// Mock the Ollama library
jest.mock('ollama');

describe('OllamaService', () => {
  let service: OllamaService;
  let mockOllama: jest.Mocked<Ollama>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create service with default URL
    service = new OllamaService();
    mockOllama = (Ollama as jest.Mock).mock.instances[0];
  });

  describe('constructor', () => {
    it('should initialize with default base URL', () => {
      expect(Ollama).toHaveBeenCalledWith({
        host: 'http://127.0.0.1:11434',
      });
    });

    it('should initialize with custom base URL', () => {
      service = new OllamaService('http://custom-url:11434');
      expect(Ollama).toHaveBeenCalledWith({
        host: 'http://custom-url:11434',
      });
    });
  });

  describe('chat', () => {
    const mockMessages: PromptType[] = [{ role: 'user', content: 'Hello' }];

    it('should handle successful chat stream', async () => {
      const mockResponse = [
        { message: { content: 'Hello' } },
        { message: { content: ' World' } },
      ];

      mockOllama.chat.mockResolvedValueOnce(mockResponse as any);

      const results = [];
      for await (const response of service.chat(mockMessages)) {
        results.push(response);
      }

      expect(results).toEqual([
        { content: 'Hello', done: false },
        { content: ' World', done: false },
        { content: '', done: true },
      ]);

      expect(mockOllama.chat).toHaveBeenCalledWith({
        model: 'llama3.2:1b',
        messages: mockMessages,
        stream: true,
      });
    });

    it('should handle chat error', async () => {
      const error = new Error('Chat error');
      mockOllama.chat.mockRejectedValueOnce(error);

      await expect(async () => {
        for await (const _ of service.chat(mockMessages)) {
          // consume iterator
        }
      }).rejects.toThrow('Chat error');
    });
  });

  describe('pullModel', () => {
    it('should handle successful model pull', async () => {
      const mockPullResponse = [
        { status: 'downloading' },
        { status: 'completed' },
      ];

      mockOllama.pull.mockResolvedValueOnce(mockPullResponse as any);

      const results = [];
      for await (const status of service.pullModel('test-model')) {
        results.push(status);
      }

      expect(results).toEqual([
        { status: 'downloading' },
        { status: 'completed' },
      ]);

      expect(mockOllama.pull).toHaveBeenCalledWith({
        model: 'test-model',
        stream: true,
      });
    });

    it('should handle pull error', async () => {
      const error = new Error('Pull error');
      mockOllama.pull.mockRejectedValueOnce(error);

      await expect(async () => {
        for await (const _ of service.pullModel('test-model')) {
          // consume iterator
        }
      }).rejects.toThrow('Pull error');
    });
  });

  describe('getAvailableModels', () => {
    it('should return list of available models', async () => {
      const mockModels = {
        models: [{ name: 'model1' }, { name: 'model2' }],
      } as any;

      mockOllama.list.mockResolvedValueOnce(mockModels);

      const result = await service.getAvailableModels();
      expect(result).toEqual(['model1', 'model2']);
    });

    it('should handle list error and return empty array', async () => {
      const error = new Error('List error');
      mockOllama.list.mockRejectedValueOnce(error);

      const result = await service.getAvailableModels();
      expect(result).toEqual([]);
    });
  });
});
