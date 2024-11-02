import { Message } from 'discord.js/typings';
import { CommandInterface } from "./command.interface";

export class Command implements CommandInterface {
  name = 'command';
  regex = new RegExp('^command', 'i');
  description = 'command description';
  
  test(content: string): boolean {
    return this.regex.test(content);
  }
  async execute(message: Message): Promise<any> {}
}
