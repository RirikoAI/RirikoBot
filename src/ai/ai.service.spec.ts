import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { AIServiceType, AIServiceConfig } from '#command/ai/ai.types';
import { OllamaService } from '#ai/services/ollama.service';
import { GoogleAIService } from '#ai/services/google-ai.service';
import { OpenRouterService } from '#ai/services/openrouter.service';
import { OpenAIService } from '#ai/services/openai.service';

jest.mock('#ai/services/ollama.service');
jest.mock('#ai/services/google-ai.service');
jest.mock('#ai/services/openrouter.service');
jest.mock('#ai/services/openai.service');

describe('AiService', () => {
  let service: AiService;
  let configService: ConfigService;

  const mockConfig: AIServiceConfig = {
    type: AIServiceType.OLLAMA,
    apiKey: 'test-api-key',
    baseUrl: 'http://test-url',
    defaultModel: 'test-model',
  };

  beforeEach(async () => {
    process.env.AI_SERVICE_API_KEY = 'test-api-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'AI_SERVICE_TYPE':
                  return mockConfig.type;
                case 'AI_SERVICE_API_KEY':
                  return mockConfig.apiKey;
                case 'AI_SERVICE_BASE_URL':
                  return mockConfig.baseUrl;
                case 'AI_SERVICE_DEFAULT_MODEL':
                  return mockConfig.defaultModel;
                default:
                  return undefined;
              }
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getService', () => {
    it('should create Ollama service instance', () => {
      const aiService = service.getService();
      expect(aiService).toBeInstanceOf(OllamaService);
    });

    it('should create Google AI service instance', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        switch (key) {
          case 'AI_SERVICE_TYPE':
            return AIServiceType.GOOGLE_AI;
          case 'AI_SERVICE_API_KEY':
            return 'test-api-key';
          default:
            return mockConfig[key];
        }
      });

      const aiService = new AiService(configService).getService();
      expect(aiService).toBeInstanceOf(GoogleAIService);
    });

    it('should create OpenRouter service instance', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        switch (key) {
          case 'AI_SERVICE_TYPE':
            return AIServiceType.OPENROUTER;
          case 'AI_SERVICE_API_KEY':
            return 'test-api-key';
          default:
            return mockConfig[key];
        }
      });

      const aiService = new AiService(configService).getService();
      expect(aiService).toBeInstanceOf(OpenRouterService);
    });

    it('should create OpenAI service instance', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        switch (key) {
          case 'AI_SERVICE_TYPE':
            return AIServiceType.OPENAI;
          case 'AI_SERVICE_API_KEY':
            return 'test-api-key';
          default:
            return mockConfig[key];
        }
      });

      const aiService = new AiService(configService).getService();
      expect(aiService).toBeInstanceOf(OpenAIService);
    });

    it('should throw error for Google AI without API key', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'AI_SERVICE_TYPE') return AIServiceType.GOOGLE_AI;
        if (key === 'AI_SERVICE_API_KEY') return undefined;
        return mockConfig[key];
      });

      expect(() => new AiService(configService).getService()).toThrow(
        'Google AI requires an API key',
      );
    });

    it('should throw error for OpenRouter without API key', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'AI_SERVICE_TYPE') return AIServiceType.OPENROUTER;
        if (key === 'AI_SERVICE_API_KEY') return undefined;
        return mockConfig[key];
      });

      expect(() => new AiService(configService).getService()).toThrow(
        'OpenRouter requires an API key',
      );
    });

    it('should throw error for OpenAI without API key', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'AI_SERVICE_TYPE') return AIServiceType.OPENAI;
        if (key === 'AI_SERVICE_API_KEY') return undefined;
        return mockConfig[key];
      });

      expect(() => new AiService(configService).getService()).toThrow(
        'OpenAI requires an API key',
      );
    });

    it('should throw error for unsupported service type', () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'AI_SERVICE_TYPE') return 'UNSUPPORTED' as AIServiceType;
        return mockConfig[key];
      });

      expect(() => new AiService(configService).getService()).toThrow(
        'Unsupported AI service type',
      );
    });

    it('should reuse existing service instance', () => {
      const firstInstance = service.getService();
      const secondInstance = service.getService();
      expect(firstInstance).toBe(secondInstance);
    });
  });

  describe('getDefaultModel', () => {
    it('should return default model', () => {
      expect(service.getDefaultModel()).toBe(mockConfig.defaultModel);
    });
  });

  describe('getServiceType', () => {
    it('should return service type', () => {
      expect(service.getServiceType()).toBe(mockConfig.type);
    });
  });
});
