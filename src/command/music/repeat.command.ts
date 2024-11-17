import { Injectable } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  CommandButtons,
  DiscordInteraction,
  DiscordMessage,
} from '#command/command.types';

/**
 * Ping command.
 * @description Use this as a template for creating new commands.
 * @category Command
 */
@Injectable()
export default class RepeatCommand extends Command implements CommandInterface {
  name = 'repeat';
  regex = new RegExp('^repeat$', 'i');
  description = 'Repeat the current queue.';
  category = 'music';
  usageExamples = ['repeat'];

  buttons: CommandButtons = {
    repeat: this.handleButton,
  };

  async runPrefix(message: DiscordMessage): Promise<void> {
    await message.reply({
      content: 'Queue repeat setting toggled',
    });
    
    await this.services.musicService.repeatQueue(message);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    await interaction.reply({
      content: 'Queue repeat setting toggled',
    });
    
    await this.services.musicService.repeatQueue(interaction);
  }

  async handleButton(interaction: DiscordInteraction): Promise<void> {
    await interaction.deferUpdate();
    await this.services.musicService.repeatQueue(interaction);
  }
}
