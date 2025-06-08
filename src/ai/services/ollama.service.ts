import { Ollama } from 'ollama';
import { AIService, AIServiceResponse, PromptType } from '#command/ai/ai.types';

export class OllamaService implements AIService {
  private ollama: Ollama;

  constructor(public baseUrl?: string) {
    // Create a new Ollama instance with the provided base URL or use default
    this.ollama = new Ollama({
      host: baseUrl || 'http://127.0.0.1:11434',
    });
  }

  async *chat(
    messages: PromptType[],
    model: string = 'llama3.2:1b',
  ): AsyncIterable<AIServiceResponse> {
    try {
      const response = await this.ollama.chat({
        model,
        messages,
        stream: true,
      });

      for await (const part of response) {
        yield {
          content: part.message.content,
          done: false,
        };
      }

      // Signal that the stream is complete
      yield {
        content: '',
        done: true,
      };
    } catch (error) {
      console.error('Error in OllamaService.chat:', error);
      throw error;
    }
  }

  async *pullModel(model: string): AsyncIterable<{ status: string }> {
    try {
      const response = await this.ollama.pull({
        model,
        stream: true,
      });

      for await (const part of response) {
        yield {
          status: part.status,
        };
      }
    } catch (error) {
      console.error('Error in OllamaService.pullModel:', error);
      throw error;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const models = await this.ollama.list();
      return models.models.map((model) => model.name);
    } catch (error) {
      console.error('Error in OllamaService.getAvailableModels:', error);
      return [];
    }
  }
}
