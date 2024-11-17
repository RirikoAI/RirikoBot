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
export default class MuteCommand extends Command implements CommandInterface {
  name = 'mute';
  regex = new RegExp('^mute$', 'i');
  description = 'Mute/unmute the current song';
  category = 'music';
  usageExamples = ['mute'];

  buttons: CommandButtons = {
    mute: this.handleButton,
    unmute: this.handleButton,
  };

  async runPrefix(message: DiscordMessage): Promise<void> {
    await this.services.musicService.muteMusic(message);
    
    await message.reply({
      content: 'Music muted/unmuted',
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    await this.services.musicService.muteMusic(interaction);
    
    await interaction.reply({
      content: 'Music muted/unmuted',
      ephemeral: true,
    })
  }

  async handleButton(interaction: DiscordInteraction): Promise<void> {
    await interaction?.deferUpdate();
    await this.services.musicService.muteMusic(interaction);
  }
}
