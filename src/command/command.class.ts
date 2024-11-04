import { CommandInteraction, Message } from 'discord.js';

import { SharedServices } from '#command/command.module';
import { DiscordClient } from '#discord/discord.client';

export type CommandConstructor = new (services: SharedServices) => Command;

export class Command {
  /**
   * Command Constructor. Inject services into the command. Add your own shortcuts here.
   * - Sets the Discord client from the DiscordService as a shortcut.
   * - Sets the getGuildPrefix function from the CommandService as a shortcut.
   * @see SharedServices
   * @see DiscordService
   * @param services
   */
  constructor(services: SharedServices) {
    this.services = services;
    this.client = services.discord?.client;
    this.getGuildPrefix = services.commandService?.getGuildPrefix;
  }

  /**
   * List of services that can be used in the command
   */
  services: SharedServices;

  /**
   * The name of the command.
   * This will be used for prefix commands and slash commands.
   */
  name: string = 'command';

  /**
   * Regular expression for the command
   * In this example, it will match the word 'command' or 'command ' (with a space and any character (or parameter) after it)
   */
  regex: RegExp = new RegExp('^command$|^command ', 'i');

  /**
   * Description of the command.
   * This will be used for the help command.
   */
  description: string = 'command description';

  /**
   * Category of the command.
   * This will be used for the help command.
   */
  category?: string = 'command';

  /**
   * Stores parameters of the command.
   * Will be set only when the command is run.
   */
  params: string[] = [];

  /**
   * Serves as a shortcut to the Discord client from the DiscordService
   * @see DiscordService
   */
  client: DiscordClient;

  /**
   * Serves as a shortcut to get the guild prefix from the CommandService
   * @see CommandService
   */
  getGuildPrefix: (message: Message) => Promise<string>;

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
  runPrefix?(message: Message): Promise<any>;

  /**
   * A function that will be called when the slash command is run
   * @param interaction {CommandInteraction}
   */
  runSlash?(interaction: CommandInteraction): Promise<any>;

  /**
   * Helper function to set the parameters of the command currently being run
   * @param content
   */
  setParams(content: string): string[] {
    this.params = content.split(' ').slice(1);
    return this.params;
  }
}
