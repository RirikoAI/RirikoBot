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
export default class StopCommand extends Command implements CommandInterface {
  name = 'stop';
  regex = new RegExp('^stop$', 'i');
  description = 'Stop and clear the entire queue';
  category = 'music';
  usageExamples = ['stop'];

  buttons: CommandButtons = {
    stop: this.handleButton,
  };

  async runPrefix(message: DiscordMessage): Promise<void> {
    await this.services.musicService.stopMusic(message);

    await message.reply({
      content: 'Music stopped',
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    await interaction.reply({
      content: 'Music stopped',
    });

    await this.services.musicService.stopMusic(interaction);
  }

  async handleButton(interaction: DiscordInteraction): Promise<void> {
    await interaction?.deferUpdate();
    await this.services.musicService.stopMusic(interaction);
  }
}
