export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface UserContext {
  userId: string;
  guildId?: string;
  channelId?: string;
  username?: string;
  displayName?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required';
  userContext?: UserContext;
}

export interface ChatToken {
  text: string;
  isFinished: boolean;
  toolCalls?: ToolCall[];
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  finishReason?: FinishReason;
}

export interface ProviderHealth {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  models?: string[];
}

export interface ChatModelProvider {
  readonly id: string;
  readonly name: string;
  readonly isAvailable: boolean;
  readonly supportedModels: readonly string[];
  readonly defaultModel: string;

  generate(request: ChatRequest): Promise<ChatResponse>;
  stream?(request: ChatRequest): AsyncIterable<ChatToken>;
  checkHealth?(): Promise<ProviderHealth>;
}
