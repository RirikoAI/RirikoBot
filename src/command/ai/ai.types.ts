export type UserPrompts = {
  userId: string;
  prompts: PromptType[];
}[];

export type PromptType = {
  role: 'user' | 'assistant';
  content: string;
};

export type PostReplyActionType = {
  action: 'play';
  payload: string;
}[];
