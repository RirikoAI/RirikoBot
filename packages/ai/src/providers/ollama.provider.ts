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

export interface OllamaProviderOptions {
  baseURL?: string | undefined;
  defaultModel?: string | undefined;
}

export class OllamaProvider implements ChatModelProvider {
  public readonly id = 'ollama';
  public readonly name = 'Ollama / Local';
  public readonly supportedModels = [
    'llama3.3',
    'llama3.2',
    'mistral',
    'qwen2.5',
    'deepseek-r1',
  ] as const;
  public readonly defaultModel: string;

  private readonly baseURL: string;

  constructor(options: OllamaProviderOptions = {}) {
    const rawUrl = options.baseURL ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.baseURL = rawUrl.replace(/\/+$/, '');
    this.defaultModel = options.defaultModel ?? 'llama3.3';
  }

  public get isAvailable(): boolean {
    return Boolean(this.baseURL);
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

  private mapMessages(messages: ChatMessage[], systemInstruction?: string) {
    const result: Array<{ role: string; content: string; tool_calls?: unknown[] }> = [];

    if (systemInstruction) {
      result.push({ role: 'system', content: systemInstruction });
    }

    const assistantToolCallIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.id) assistantToolCallIds.add(tc.id);
        }
      }
    }

    const respondingToolCallIds = new Set(
      messages
        .filter((m) => m.role === 'tool' && m.toolCallId && assistantToolCallIds.has(m.toolCallId))
        .map((m) => m.toolCallId!),
    );
    const hasAnyToolResponses = messages.some((m) => m.role === 'tool');

    for (const msg of messages) {
      if (msg.role === 'tool') {
        if (!msg.toolCallId || respondingToolCallIds.has(msg.toolCallId)) {
          result.push({
            role: 'tool',
            content: msg.content,
          });
        }
      } else if (msg.role === 'assistant') {
        const validToolCalls =
          msg.toolCalls?.filter(
            (tc) => respondingToolCallIds.has(tc.id) || (hasAnyToolResponses && !tc.id),
          ) ?? [];

        if (validToolCalls.length > 0) {
          result.push({
            role: 'assistant',
            content: msg.content,
            tool_calls: validToolCalls.map((tc) => ({
              function: {
                name: this.sanitizeToolName(tc.name),
                arguments: tc.arguments,
              },
            })),
          });
        } else {
          result.push({
            role: 'assistant',
            content: msg.content || '*(No response)*',
          });
        }
      } else {
        result.push({
          role: msg.role === 'system' ? 'system' : 'user',
          content: msg.content,
        });
      }
    }

    return result;
  }

  private mapTools(tools?: ChatRequest['tools']) {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: this.sanitizeToolName(t.name),
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  public async generate(request: ChatRequest): Promise<ChatResponse> {
    const model = request.model ?? this.defaultModel;
    const messages = this.mapMessages(request.messages, request.systemInstruction);
    const tools = this.mapTools(request.tools);

    const payload: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };

    if (tools) {
      payload.tools = tools;
    }

    const options: Record<string, unknown> = {};
    if (request.temperature !== undefined) options.temperature = request.temperature;
    if (request.maxOutputTokens !== undefined) options.num_predict = request.maxOutputTokens;
    if (Object.keys(options).length > 0) payload.options = options;

    try {
      const response = await fetch(`${this.baseURL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        this.handleHttpError(response.status, errorText);
      }

      const data = (await response.json()) as {
        model?: string;
        message?: {
          role: string;
          content: string;
          tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
        };
        done?: boolean;
        prompt_eval_count?: number;
        eval_count?: number;
      };

      const toolCalls: ToolCall[] = [];
      if (data.message?.tool_calls) {
        for (const tc of data.message.tool_calls) {
          toolCalls.push({
            id: `call_${Math.random().toString(36).slice(2, 9)}`,
            name: this.restoreToolName(tc.function.name, request.tools),
            arguments: tc.function.arguments ?? {},
          });
        }
      }

      const finishReason: FinishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';

      return {
        content: data.message?.content ?? '',
        model: data.model ?? model,
        provider: this.id,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        finishReason,
        usage: {
          promptTokens: data.prompt_eval_count,
          completionTokens: data.eval_count,
          totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        },
      };
    } catch (err: unknown) {
      this.handleNetworkError(err);
    }
  }

  public async *stream(request: ChatRequest): AsyncIterable<ChatToken> {
    const model = request.model ?? this.defaultModel;
    const messages = this.mapMessages(request.messages, request.systemInstruction);
    const tools = this.mapTools(request.tools);

    const payload: Record<string, unknown> = {
      model,
      messages,
      stream: true,
    };

    if (tools) {
      payload.tools = tools;
    }

    const options: Record<string, unknown> = {};
    if (request.temperature !== undefined) options.temperature = request.temperature;
    if (request.maxOutputTokens !== undefined) options.num_predict = request.maxOutputTokens;
    if (Object.keys(options).length > 0) payload.options = options;

    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        this.handleHttpError(response.status, errorText);
      }
    } catch (err: unknown) {
      this.handleNetworkError(err);
    }

    if (!response.body) {
      throw new AiProviderError(this.id, {
        message: 'Ollama response body is empty or not readable.',
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolCalls: ToolCall[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const data = JSON.parse(trimmed) as {
              message?: {
                content?: string;
                tool_calls?: Array<{
                  function: { name: string; arguments: Record<string, unknown> };
                }>;
              };
              done?: boolean;
            };

            const text = data.message?.content ?? '';
            if (data.message?.tool_calls) {
              for (const tc of data.message.tool_calls) {
                toolCalls.push({
                  id: `call_${Math.random().toString(36).slice(2, 9)}`,
                  name: this.restoreToolName(tc.function.name, request.tools),
                  arguments: tc.function.arguments ?? {},
                });
              }
            }

            if (text) {
              yield {
                text,
                isFinished: false,
              };
            }
          } catch {
            // Partial JSON in stream buffer, continue
          }
        }
      }

      yield {
        text: '',
        isFinished: true,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      };
    } catch (err: unknown) {
      this.handleNetworkError(err);
    }
  }

  public async checkHealth(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseURL}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        return {
          healthy: false,
          latencyMs: Date.now() - start,
          error: `Ollama returned HTTP status ${response.status}`,
        };
      }

      const data = (await response.json()) as { models?: Array<{ name: string }> };
      const modelNames = data.models?.map((m) => m.name) ?? [];

      return {
        healthy: true,
        latencyMs: Date.now() - start,
        models: modelNames.length > 0 ? modelNames : [...this.supportedModels],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: `Ollama unreachable at ${this.baseURL}: ${message}`,
      };
    }
  }

  private handleHttpError(status: number, errorText: string): never {
    if (status === 429) {
      throw new AiRateLimitError(this.id, {
        message: `Ollama rate limited (429): ${errorText}`,
      });
    }

    throw new AiProviderError(this.id, {
      message: `Ollama HTTP error ${status}: ${errorText}`,
      externalStatusCode: status,
    });
  }

  private handleNetworkError(err: unknown): never {
    if (err instanceof AiProviderError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new AiProviderError(this.id, {
      message: `Failed to communicate with Ollama at ${this.baseURL}: ${message}`,
      isRetryable: true,
      details: err,
    });
  }
}
