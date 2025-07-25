export type UserPrompts = {
  userId: string;
  prompts: PromptType[];
}[];

export type PromptType = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type PostReplyActionType = {
  action: 'play';
  payload: string;
}[];

export enum AIServiceType {
  OLLAMA = 'ollama',
  GOOGLE_AI = 'google_ai',
  OPENROUTER = 'openrouter',
  OPENAI = 'openai',
}

export interface AIServiceConfig {
  type: AIServiceType;
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
}

export interface AIServiceResponse {
  content: string;
  done: boolean;
}

export interface AIService {
  chat(messages: PromptType[], model?: string): AsyncIterable<AIServiceResponse>;
  pullModel(model: string): AsyncIterable<{ status: string }>;
  getAvailableModels(): Promise<string[]>;
}
