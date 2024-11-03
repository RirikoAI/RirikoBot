import { CommandInterface } from './command.interface';
import { CommandInteraction, Message } from 'discord.js';
import { CommandServices } from '#command/command.service';

export type CommandConstructor = new (services: CommandServices) => Command;

export class Command implements CommandInterface {
  /**
   * List of services that can be used in the command
   */
  services: CommandServices;
  
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
   * Command Constructor. Inject services into the command
   * @param services
   */
  constructor(services: CommandServices) {
    this.services = services;
  }
  
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
  runPrefix?(message: Message): Promise<any>
  
  /**
   * A function that will be called when the slash command is run
   * @param interaction {CommandInteraction}
   */
  runSlash?(interaction: CommandInteraction): Promise<any>
}
