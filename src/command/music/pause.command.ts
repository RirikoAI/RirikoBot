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
export default class PauseCommand extends Command implements CommandInterface {
  name = 'pause';
  regex = new RegExp('^pause$', 'i');
  description = 'Pause the current song';
  category = 'music';
  usageExamples = ['pause'];

  buttons: CommandButtons = {
    pause: this.handleButton,
  };

  async runPrefix(message: DiscordMessage): Promise<void> {
    await this.services.musicService.pauseMusic(message);

    await message.reply({
      content: 'Music paused/unpaused',
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    await this.services.musicService.pauseMusic(interaction);

    await interaction.reply({
      content: 'Music paused/unpaused',
    });
  }

  async handleButton(interaction: DiscordInteraction): Promise<void> {
    await interaction?.deferUpdate();
    await this.services.musicService.pauseMusic(interaction);
  }
}
