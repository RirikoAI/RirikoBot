import { SharedServices } from '#command/command.module';
import { DiscordClient } from '#discord/discord.client';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptions,
} from '#command/command.types';
import { CommandFeatures } from '#command/command.features';
import { Pages } from '#util/features/pagination-feature-types';

export type CommandConstructor = new (services: SharedServices) => Command;

/**
 * Command class that will be extended by all commands.
 * This class contains all the necessary properties and methods for a command.
 * @class Command
 * @extends CommandFeatures
 * @implements CommandInterface
 * @author Earnest Angel (https://angel.net.my)
 */
export class Command extends CommandFeatures {
  /**
   * Command Constructor. Inject services into the command. Add your own shortcuts here.
   * - Sets the Discord client from the DiscordService as a shortcut.
   * - Sets the getGuildPrefix function from the CommandService as a shortcut.
   * - Sets the allParams variable as a shortcut to the params array joined into a string.
   * @see SharedServices
   * @see DiscordService
   * @param services
   */
  constructor(services: SharedServices) {
    super();
    this.services = services;
    this.client = services.discord?.client;
    this.getGuildPrefix = services.commandService?.getGuildPrefix;
    this.init();
  }

  /**
   * The name of the command.
   * This will be used for prefix commands and slash commands.
   * @required
   */
  name?: string;

  /**
   * Description of the command.
   * This will be used for the help command.
   * @required
   */
  description?: string;

  /**
   * Regular expression for the command.\n
   * Example: ```regex?: RegExp = new RegExp('^command$|^command ', 'i');```
   *
   * In this example, it will match the word 'command' or
   * 'command ' (with a space and any character a.k.a. parameters after it)
   * @required
   */
  regex?: RegExp = new RegExp('^command$|^command ', 'i');

  /**
   * Slash and prefix command usage examples.
   * Example: ['prefix', 'prefix <prefix>', 'setprefix <prefix>']
   *
   * @required
   */
  usageExamples?: string[];

  // -- Optional

  /**
   * Category of the command.
   * This will be used for the help command.
   * @optional
   */
  category?: string;

  /**
   * Slash command options.
   * Only add if your slash command requires additional parameters.
   *
   * @see CommandsLoaderUtil
   * @optional
   */
  slashOptions?: SlashCommandOptions;

  pages?: Pages;

  // -- System

  /**
   * List of services that can be used in the command
   */
  services: SharedServices;

  /**
   * Stores parameters of the command.
   * Will be set only when the command is run.
   */
  params: string[] = [];

  /**
   * Stores params merged into a string.
   */
  allParams: string;

  /**
   * Serves as a shortcut to the Discord client from the DiscordService
   * @see DiscordService
   */
  client: DiscordClient;

  /**
   * Serves as a shortcut to get the guild prefix from the CommandService
   * @see CommandService
   */
  getGuildPrefix: (message: DiscordMessage) => Promise<string>;

  /**
   * Test if the content matches the command
   * @param content {string}
   */
  test(content: string): boolean {
    return this.regex.test(content);
  }

  /**
   * A function that will be called when the prefix command is run
   * @param message {Message}
   */
  async runPrefix?(message: DiscordMessage): Promise<any>;

  /**
   * A function that will be called when the slash command is run
   * @param interaction {DiscordInteraction}
   */
  async runSlash?(interaction: DiscordInteraction): Promise<any>;

  /**
   * Helper function to set the parameters of the command currently being run
   * @param content
   */
  setParams(content: string): string[] {
    this.params = content.split(' ').slice(1);
    this.allParams = this.params.join(' ');
    return this.params;
  }

  /**
   * Helper method to initialize the command.
   */
  init() {}
}
