import { GoogleGenAI } from '@google/genai';
import {
  ChatModelProvider,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatToken,
  FinishReason,
  ProviderHealth,
  ToolCall,
} from '../types/index.js';
import { AiProviderError, AiRateLimitError } from '../errors/index.js';

export interface GeminiProviderOptions {
  apiKey?: string | undefined;
  defaultModel?: string | undefined;
}

export class GeminiProvider implements ChatModelProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini';
  public readonly supportedModels = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3.5-flash-lite',
    'gemini-3.7-flash',
  ] as const;
  public readonly defaultModel: string;

  private readonly apiKey?: string | undefined;
  private readonly client?: GoogleGenAI | undefined;

  constructor(options: GeminiProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
    this.defaultModel = options.defaultModel ?? 'gemini-2.5-flash';

    if (this.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
  }

  public get isAvailable(): boolean {
    return Boolean(this.apiKey && this.client);
  }

  private ensureClient(): GoogleGenAI {
    if (!this.client) {
      throw new AiProviderError(this.id, {
        message: 'Google Gemini API key is not configured (GEMINI_API_KEY missing).',
        externalStatusCode: 401,
        isRetryable: false,
      });
    }
    return this.client;
  }

  private sanitizeToolName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private restoreToolName(name: string, originalTools?: ChatRequest['tools']): string {
    if (originalTools) {
      const match = originalTools.find(
        (t) => this.sanitizeToolName(t.name) === name || t.name === name,
      );
      if (match) return match.name;
    }
    return name;
  }

  private mapMessages(messages: ChatMessage[]) {
    const toolResponses = messages.filter((m) => m.role === 'tool');
    const respondingNames = new Set(
      toolResponses.map((m) => this.sanitizeToolName(m.name ?? '')).filter(Boolean),
    );
    const respondingCallIds = new Set(toolResponses.map((m) => m.toolCallId).filter(Boolean));

    return messages
      .filter((m) => m.role !== 'system')
      .map((msg) => {
        if (msg.role === 'tool') {
          return {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: this.sanitizeToolName(msg.name ?? 'tool_response'),
                  response: { content: msg.content },
                },
              },
            ],
          };
        }

        if (msg.role === 'assistant') {
          const parts: Array<Record<string, unknown>> = [];
          if (msg.content) {
            parts.push({ text: msg.content });
          }
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            for (const tc of msg.toolCalls) {
              const sanitized = this.sanitizeToolName(tc.name);
              // Only include functionCall if there is a corresponding tool response in the messages
              const hasResponse =
                respondingCallIds.has(tc.id) ||
                respondingNames.has(sanitized) ||
                (toolResponses.length > 0 && !tc.id && !msg.content);
              if (hasResponse) {
                parts.push({
                  functionCall: {
                    name: sanitized,
                    args: tc.arguments,
                  },
                });
              }
            }
          }
          if (parts.length === 0) {
            parts.push({ text: '*(No response)*' });
          }
          return { role: 'model', parts };
        }

        return {
          role: 'user',
          parts: [{ text: msg.content }],
        };
      });
  }

  private buildConfig(request: ChatRequest) {
    const config: Record<string, unknown> = {};

    if (request.systemInstruction) {
      config.systemInstruction = request.systemInstruction;
    }
    if (request.temperature !== undefined) {
      config.temperature = request.temperature;
    }
    if (request.maxOutputTokens !== undefined) {
      config.maxOutputTokens = request.maxOutputTokens;
    }

    if (request.tools && request.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: this.sanitizeToolName(t.name),
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    return config;
  }

  public async generate(request: ChatRequest): Promise<ChatResponse> {
    const client = this.ensureClient();
    const model = request.model ?? this.defaultModel;
    const contents = this.mapMessages(request.messages);
    const config = this.buildConfig(request);

    try {
      const response = await client.models.generateContent({
        model,
        contents,
        config,
      });

      const candidate = response.candidates?.[0];
      const textParts: string[] = [];
      const toolCalls: ToolCall[] = [];

      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if ('text' in part && typeof part.text === 'string') {
            textParts.push(part.text);
          }
          if ('functionCall' in part && part.functionCall) {
            const fc = part.functionCall as { name: string; args: Record<string, unknown> };
            toolCalls.push({
              id: `call_${Math.random().toString(36).slice(2, 9)}`,
              name: this.restoreToolName(fc.name, request.tools),
              arguments: fc.args ?? {},
            });
          }
        }
      }

      let finishReason: FinishReason = 'stop';
      if (toolCalls.length > 0) {
        finishReason = 'tool_calls';
      } else if (candidate?.finishReason) {
        const fr = String(candidate.finishReason).toLowerCase();
        if (fr.includes('length')) finishReason = 'length';
        else if (fr.includes('safety') || fr.includes('block')) finishReason = 'content_filter';
      }

      return {
        content: textParts.join(''),
        model,
        provider: this.id,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        finishReason,
        usage: {
          promptTokens: response.usageMetadata?.promptTokenCount,
          completionTokens: response.usageMetadata?.candidatesTokenCount,
          totalTokens: response.usageMetadata?.totalTokenCount,
        },
      };
    } catch (err: unknown) {
      this.handleError(err);
    }
  }

  public async *stream(request: ChatRequest): AsyncIterable<ChatToken> {
    const client = this.ensureClient();
    const model = request.model ?? this.defaultModel;
    const contents = this.mapMessages(request.messages);
    const config = this.buildConfig(request);

    try {
      const responseStream = await client.models.generateContentStream({
        model,
        contents,
        config,
      });

      for await (const chunk of responseStream) {
        const candidate = chunk.candidates?.[0];
        const textParts: string[] = [];
        const toolCalls: ToolCall[] = [];

        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if ('text' in part && typeof part.text === 'string') {
              textParts.push(part.text);
            }
            if ('functionCall' in part && part.functionCall) {
              const fc = part.functionCall as { name: string; args: Record<string, unknown> };
              toolCalls.push({
                id: `call_${Math.random().toString(36).slice(2, 9)}`,
                name: this.restoreToolName(fc.name, request.tools),
                arguments: fc.args ?? {},
              });
            }
          }
        }

        yield {
          text: textParts.join(''),
          isFinished: false,
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
        };
      }

      yield {
        text: '',
        isFinished: true,
      };
    } catch (err: unknown) {
      this.handleError(err);
    }
  }

  public async checkHealth(): Promise<ProviderHealth> {
    if (!this.isAvailable) {
      return {
        healthy: false,
        error: 'API key not configured.',
      };
    }

    const start = Date.now();
    try {
      const client = this.ensureClient();
      await client.models.generateContent({
        model: this.defaultModel,
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        config: { maxOutputTokens: 2 },
      });
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        models: [...this.supportedModels],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: message,
      };
    }
  }

  private handleError(err: unknown): never {
    if (err instanceof AiProviderError) {
      throw err;
    }

    const message = err instanceof Error ? err.message : String(err);
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
        ? err.status
        : undefined;

    if (
      status === 429 ||
      message.includes('429') ||
      message.toLowerCase().includes('quota') ||
      message.toLowerCase().includes('resource_exhausted')
    ) {
      throw new AiRateLimitError(this.id, {
        message,
        details: err,
      });
    }

    throw new AiProviderError(this.id, {
      message: `Gemini API error: ${message}`,
      externalStatusCode: status,
      details: err,
    });
  }
}
