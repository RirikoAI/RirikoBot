import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
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

export interface OpenAIProviderOptions {
  apiKey?: string | undefined;
  baseURL?: string | undefined;
  defaultModel?: string | undefined;
}

export class OpenAIProvider implements ChatModelProvider {
  public readonly id = 'openai';
  public readonly name = 'OpenAI';
  public readonly supportedModels = [
    'gpt-4o-mini',
    'gpt-4o',
    'o3-mini',
  ] as const;
  public readonly defaultModel: string;

  private readonly apiKey?: string | undefined;
  private readonly baseURL?: string | undefined;
  private readonly client?: OpenAI | undefined;

  constructor(options: OpenAIProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.baseURL = options.baseURL;
    this.defaultModel = options.defaultModel ?? 'gpt-4o-mini';

    if (this.apiKey) {
      this.client = new OpenAI({
        apiKey: this.apiKey,
        ...(this.baseURL ? { baseURL: this.baseURL } : {}),
      });
    }
  }

  public get isAvailable(): boolean {
    return Boolean(this.apiKey && this.client);
  }

  private ensureClient(): OpenAI {
    if (!this.client) {
      throw new AiProviderError(this.id, {
        message: 'OpenAI API key is not configured (OPENAI_API_KEY missing).',
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

  private mapMessages(messages: ChatMessage[], systemInstruction?: string): ChatCompletionMessageParam[] {
    const result: ChatCompletionMessageParam[] = [];

    if (systemInstruction) {
      result.push({ role: 'system', content: systemInstruction });
    }

    // Collect all tool call IDs declared by assistant messages
    const assistantToolCallIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.id) assistantToolCallIds.add(tc.id);
        }
      }
    }

    // Collect tool response IDs that actually correspond to an assistant tool call.
    // In OpenAI Chat Completion API, an assistant message with 'tool_calls' must be followed
    // by tool messages responding to EACH 'tool_call_id'. If an assistant message contains toolCalls
    // from a historical turn that already resolved into conversational text without explicit tool messages,
    // sending 'tool_calls' without response messages causes OpenAI to reject the request with HTTP 400.
    const respondingToolCallIds = new Set(
      messages
        .filter((m) => m.role === 'tool' && m.toolCallId && assistantToolCallIds.has(m.toolCallId))
        .map((m) => m.toolCallId!),
    );

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'tool') {
        // Only include tool response messages if they correspond to a valid assistant tool call
        if (msg.toolCallId && respondingToolCallIds.has(msg.toolCallId)) {
          result.push({
            role: 'tool',
            tool_call_id: msg.toolCallId,
            content: msg.content,
          });
        }
      } else if (msg.role === 'assistant') {
        const validToolCalls = msg.toolCalls?.filter((tc) => respondingToolCallIds.has(tc.id)) ?? [];
        if (validToolCalls.length > 0) {
          result.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: validToolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: this.sanitizeToolName(tc.name),
                arguments: JSON.stringify(tc.arguments),
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
          role: 'user',
          content: msg.content,
        });
      }
    }

    return result;
  }

  private mapTools(tools?: ChatRequest['tools']): ChatCompletionTool[] | undefined {
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
    const client = this.ensureClient();
    const model = request.model ?? this.defaultModel;
    const messages = this.mapMessages(request.messages, request.systemInstruction);
    const tools = this.mapTools(request.tools);

    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        ...(tools ? { tools, tool_choice: request.toolChoice ?? 'auto' } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxOutputTokens !== undefined ? { max_completion_tokens: request.maxOutputTokens } : {}),
      });

      const choice = response.choices[0];
      const toolCalls: ToolCall[] = [];

      if (choice?.message?.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          if (tc.type === 'function') {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              args = { raw: tc.function.arguments };
            }
            toolCalls.push({
              id: tc.id,
              name: this.restoreToolName(tc.function.name, request.tools),
              arguments: args,
            });
          }
        }
      }

      let finishReason: FinishReason = 'stop';
      if (choice?.finish_reason === 'tool_calls') {
        finishReason = 'tool_calls';
      } else if (choice?.finish_reason === 'length') {
        finishReason = 'length';
      } else if (choice?.finish_reason === 'content_filter') {
        finishReason = 'content_filter';
      }

      return {
        content: choice?.message?.content ?? '',
        model,
        provider: this.id,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        finishReason,
        usage: {
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
          totalTokens: response.usage?.total_tokens,
        },
      };
    } catch (err: unknown) {
      this.handleError(err);
    }
  }

  public async *stream(request: ChatRequest): AsyncIterable<ChatToken> {
    const client = this.ensureClient();
    const model = request.model ?? this.defaultModel;
    const messages = this.mapMessages(request.messages, request.systemInstruction);
    const tools = this.mapTools(request.tools);

    try {
      const stream = await client.chat.completions.create({
        model,
        messages,
        stream: true,
        ...(tools ? { tools, tool_choice: request.toolChoice ?? 'auto' } : {}),
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.maxOutputTokens !== undefined ? { max_completion_tokens: request.maxOutputTokens } : {}),
      });

      const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const text = delta?.content ?? '';

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index;
            const existing = toolCallMap.get(index) ?? { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.args += tc.function.arguments;
            toolCallMap.set(index, existing);
          }
        }

        if (text) {
          yield {
            text,
            isFinished: false,
          };
        }
      }

      // If tool calls were accumulated across chunks, emit them in the finish token
      const completedToolCalls: ToolCall[] = [];
      for (const tc of toolCallMap.values()) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.args);
        } catch {
          args = { raw: tc.args };
        }
        completedToolCalls.push({
          id: tc.id || `call_${Math.random().toString(36).slice(2, 9)}`,
          name: this.restoreToolName(tc.name, request.tools),
          arguments: args,
        });
      }

      yield {
        text: '',
        isFinished: true,
        ...(completedToolCalls.length > 0 ? { toolCalls: completedToolCalls } : {}),
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
      await client.models.list();
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
      message.toLowerCase().includes('rate limit') ||
      message.toLowerCase().includes('insufficient_quota')
    ) {
      throw new AiRateLimitError(this.id, {
        message,
        details: err,
      });
    }

    throw new AiProviderError(this.id, {
      message: `OpenAI API error: ${message}`,
      externalStatusCode: status,
      details: err,
    });
  }
}
