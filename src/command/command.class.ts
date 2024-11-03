import {CommandInterface} from "./command.interface";
import {Message} from "discord.js";

export type CommandConstructor = new (services: any) => Command;

export class Command implements CommandInterface {
    name = 'command';
    regex = new RegExp('^command', 'i');
    description = 'command description';

    test(content: string): boolean {
        return this.regex.test(content);
    }

    async execute(message: Message): Promise<any> {
    }
}
