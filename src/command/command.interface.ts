import { Message } from 'discord.js';

export interface CommandInterface {
  name: string;
  regex: RegExp;
  description: string;

  test(content: string): boolean;

  execute(message: Message): Promise<any>;
}
