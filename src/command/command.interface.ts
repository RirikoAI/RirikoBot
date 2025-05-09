import {
  CommandButtons,
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptions,
} from '#command/command.types';
import { Pages } from '#util/features/pagination-feature.types';
import { DiscordPermission } from '#util/features/permissions.util';

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
  permissions?: DiscordPermission[] | any;
  slashOptions?: SlashCommandOptions;
  pages?: Pages;
  buttons?: CommandButtons;

  test(content: string): boolean;

  runPrefix?(message: DiscordMessage): Promise<any>;

  runSlash?(interaction: DiscordInteraction): Promise<any>;

  runChatMenu?(interaction: DiscordInteraction): Promise<any>;

  runUserMenu?(interaction: DiscordInteraction): Promise<any>;

  runChatMenu?(interaction: DiscordInteraction): Promise<any>;

  runCli?(input: string): Promise<any>;
}
