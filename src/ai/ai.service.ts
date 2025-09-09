import {
  AIService,
  AIServiceConfig,
  AIServiceType,
} from '#command/ai/ai.types';
import { OllamaService } from '#ai/services/ollama.service';
import { GoogleAIService } from '#ai/services/google-ai.service';
import { OpenRouterService } from '#ai/services/openrouter.service';
import { OpenAIService } from '#ai/services/openai.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService {
  private serviceConfig: AIServiceConfig;
  private serviceInstance: AIService | null = null;

  constructor(private configService: ConfigService) {
    // Load configuration from environment variables
    this.serviceConfig = {
      type:
        this.configService.get<AIServiceType>('ai.serviceType') ||
        AIServiceType.OLLAMA,
      apiKey: this.configService.get<string>('ai.apiKey'),
      baseUrl: this.configService.get<string>('ai.baseUrl'),
      defaultModel: this.configService.get<string>('ai.defaultModel'),
    };
  }

  /**
   * Get the configured AI service instance
   * @returns The AI service instance
   */
  getService(): AIService {
    if (!this.serviceInstance) {
      this.serviceInstance = this.createService(this.serviceConfig);
    }
    return this.serviceInstance;
  }

  /**
   * Create a new AI service instance based on the provided configuration
   * @param config The AI service configuration
   * @returns A new AI service instance
   */
  private createService(config: AIServiceConfig): AIService {
    switch (config.type) {
      case AIServiceType.OLLAMA:
        return new OllamaService(config.baseUrl);

      case AIServiceType.GOOGLE_AI:
        if (!config.apiKey) {
          throw new Error('Google AI requires an API key');
        }
        return new GoogleAIService(config.apiKey, config.baseUrl);

      case AIServiceType.OPENROUTER:
        if (!config.apiKey) {
          throw new Error('OpenRouter requires an API key');
        }
        return new OpenRouterService(config.apiKey, config.baseUrl);

      case AIServiceType.OPENAI:
        if (!config.apiKey) {
          throw new Error('OpenAI requires an API key');
        }
        return new OpenAIService(config.apiKey, config.baseUrl);

      default:
        throw new Error(`Unsupported AI service type: ${config.type}`);
    }
  }

  /**
   * Get the default model for the current service
   * @returns The default model name
   */
  getDefaultModel(): string {
    return this.serviceConfig.defaultModel;
  }

  /**
   * Get the current service type
   * @returns The service type
   */
  getServiceType(): AIServiceType {
    return this.serviceConfig.type;
  }
}
