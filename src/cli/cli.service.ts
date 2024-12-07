import { Injectable, Logger } from '@nestjs/common';
import * as readline from 'readline';
import { CommandService } from '#command/command.service';

@Injectable()
export class CliService {
  private rl: readline.Interface;
  private logger: Logger = new Logger('Ririko CLI');

  constructor(private commandService: CommandService) {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.rl.on('line', this.handleInput.bind(this));
  }

  async start() {
    console.log('[Ririko CLI] Welcome. Please enter your command:');
    process.stdout.write('> ');
  }

  private async handleInput(input: string) {
    if (input.trim().toLowerCase() === 'exit') {
      this.logger.log('Goodbye!');
      this.rl.close();
      process.exit(0);
    } else {
      // check if an input is entered
      if (!input) {
        process.stdout.write('> ');
        return;
      }

      await this.commandService.checkCliCommand(input);
      process.stdout.write('> ');
    }
  }
}
