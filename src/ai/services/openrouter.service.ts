import {
  AIService,
  AIServiceResponse,
  PromptType,
} from '../../command/ai/ai.types';

export class OpenRouterService implements AIService {
  private apiKey: string;
  private baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl: string = 'https://openrouter.ai/api/v1',
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async *chat(
    messages: PromptType[],
    model: string = 'meta-llama/llama-3.3-8b-instruct:free',
  ): AsyncIterable<AIServiceResponse> {
    try {
      // Create the request URL
      const url = `${this.baseUrl}/chat/completions`;

      // Make the API request
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/ririkoai/ririkobot',
          'X-Title': 'Ririko Bot',
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenRouter API error: ${response.status} ${errorText}`,
        );
      }

      // OpenRouter returns a stream of Server-Sent Events (SSE)
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages in the buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove 'data: ' prefix

            // Check for the end of the stream
            if (data === '[DONE]') {
              continue;
            }

            try {
              const chunk = JSON.parse(data);

              // Extract content from the chunk
              if (chunk.choices && chunk.choices[0]?.delta?.content) {
                const content = chunk.choices[0].delta.content;
                yield {
                  content,
                  done: false,
                };
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

      // Signal that the stream is complete
      yield {
        content: '',
        done: true,
      };
    } catch (error) {
      console.error('Error in OpenRouterService.chat:', error);
      throw error;
    }
  }

  async *pullModel(model: string): AsyncIterable<{ status: string }> {
    // OpenRouter models are cloud-based and don't need to be pulled
    yield {
      status: `OpenRouter models are cloud-based. Model ${model} is ready to use.`,
    };
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const url = `${this.baseUrl}/models`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/ririkoai/ririkobot',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      return data.data.map((model) => model.id);
    } catch (error) {
      console.error('Error in OpenRouterService.getAvailableModels:', error);
      return ['openai/gpt-4.1-nano']; // Return default model if API call fails
    }
  }
}
