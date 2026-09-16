export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string | undefined;
  toolCalls?: ToolCall[] | undefined;
  toolCallId?: string | undefined;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface UserContext {
  userId: string;
  guildId?: string | undefined;
  channelId?: string | undefined;
  username?: string | undefined;
  displayName?: string | undefined;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string | undefined;
  systemInstruction?: string | undefined;
  temperature?: number | undefined;
  maxOutputTokens?: number | undefined;
  tools?: ToolDefinition[] | undefined;
  toolChoice?: ('auto' | 'none' | 'required') | undefined;
  userContext?: UserContext | undefined;
}

export interface ChatToken {
  text: string;
  isFinished: boolean;
  toolCalls?: ToolCall[] | undefined;
}

export interface TokenUsage {
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
  totalTokens?: number | undefined;
}

export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error';

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  toolCalls?: ToolCall[] | undefined;
  usage?: TokenUsage | undefined;
  finishReason?: FinishReason | undefined;
}

export interface ProviderHealth {
  healthy: boolean;
  latencyMs?: number | undefined;
  error?: string | undefined;
  models?: string[] | undefined;
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
