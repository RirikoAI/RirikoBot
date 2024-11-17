import {
  CommandButtons,
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptions,
} from '#command/command.types';
import { Pages } from '#util/features/pagination-feature.types';

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
  category: string;
  usageExamples: string[];
  slashOptions?: SlashCommandOptions;
  pages?: Pages;
  buttons?: CommandButtons;

  test(content: string): boolean;

  runPrefix?(message: DiscordMessage): Promise<any>;

  runSlash?(interaction: DiscordInteraction): Promise<any>;
}
