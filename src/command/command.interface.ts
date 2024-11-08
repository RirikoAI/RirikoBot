import { CommandInteraction, Message } from 'discord.js';
import { Pages, SlashCommandOptions } from '#command/command.types';

/**
 * Command Interface
 * @description Interface for creating new commands. Use this as a template for creating new commands.
 * @category Interface
 * @author Earnest Angel (https://angel.net.my)
 */
export interface CommandInterface {
  name: string;

  regex: RegExp;
  description: string;
  category?: string;
  usageExamples: string[];
  slashOptions?: SlashCommandOptions;
  pages?: Pages;

  test(content: string): boolean;

  runPrefix?(message: Message): Promise<any>;

  runSlash?(interaction: CommandInteraction): Promise<any>;
}
