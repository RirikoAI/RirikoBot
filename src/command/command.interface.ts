import { CommandInteraction, Message } from 'discord.js';

export interface CommandInterface {
  name: string;

  regex: RegExp;
  description: string;
  category?: string;
  usageExamples: string[];

  test(content: string): boolean;

  runPrefix?(message: Message): Promise<any>;

  runSlash?(interaction: CommandInteraction): Promise<any>;
}
