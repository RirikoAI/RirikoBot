import { AIService, AIServiceResponse, PromptType } from '#command/ai/ai.types';

export class GoogleAIService implements AIService {
  private apiKey: string;
  private baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta',
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async *chat(
    messages: PromptType[],
    model: string = 'gemini-2.0-flash',
  ): AsyncIterable<AIServiceResponse> {
    try {
      // Convert messages to Google AI format
      const googleMessages = messages.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content }],
      }));

      // Create the request URL
      const url = `${this.baseUrl}/models/${model}:streamGenerateContent?key=${this.apiKey}`;

      // Make the API request
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: googleMessages,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google AI API error: ${response.status} ${errorText}`);
      }

      // Google AI returns a stream of JSON objects
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete JSON objects in the buffer
        let startPos = 0;
        while (startPos < buffer.length) {
          // Find the next JSON object
          const jsonStart = buffer.indexOf('{', startPos);
          if (jsonStart === -1) break;

          try {
            // Try to parse the JSON object
            const jsonEnd = this.findJsonEnd(buffer, jsonStart);
            if (jsonEnd === -1) break;

            const jsonStr = buffer.substring(jsonStart, jsonEnd + 1);
            const chunk = JSON.parse(jsonStr);

            // Extract content from the chunk
            if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
              const content = chunk.candidates[0].content.parts[0]?.text || '';
              yield {
                content,
                done: false,
              };
            }

            startPos = jsonEnd + 1;
          } catch (e) {
            // If we can't parse the JSON yet, wait for more data
            break;
          }
        }

        // Remove processed data from buffer
        buffer = buffer.substring(startPos);
      }

      // Signal that the stream is complete
      yield {
        content: '',
        done: true,
      };
    } catch (error) {
      console.error('Error in GoogleAIService.chat:', error);
      throw error;
    }
  }

  // Helper method to find the end of a JSON object
  private findJsonEnd(str: string, startPos: number): number {
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startPos; i < str.length; i++) {
      const char = str[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"' && !escape) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0) {
            return i;
          }
        }
      }
    }

    return -1; // No complete JSON object found
  }

  async *pullModel(model: string): AsyncIterable<{ status: string }> {
    // Google AI models are cloud-based and don't need to be pulled
    yield {
      status: `Google AI models are cloud-based. Model ${model} is ready to use.`,
    };
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      return data.models
        .filter((model) =>
          model.supportedGenerationMethods.includes('generateContent'),
        )
        .map((model) => model.name.split('/').pop());
    } catch (error) {
      console.error('Error in GoogleAIService.getAvailableModels:', error);
      return ['gemini-2.0-flash']; // Return default model if API call fails
    }
  }
}
