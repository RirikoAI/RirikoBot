import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';

export default class VolumeCommand extends Command implements CommandInterface {
  name = 'volume';
  regex = new RegExp('^volume$|^volume ', 'i');
  description = 'Change the volume of the music';
  category = 'music';
  usageExamples = ['volume', 'volume <number>'];

  slashOptions = [
    {
      name: 'volume',
      description: 'Volume to set',
      type: SlashCommandOptionTypes.Integer,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    const volume = parseInt(this.params.join(' ').replace(/\D/g, ''));

    // check if volume is not more than 100 or less than 0
    if (volume > 100 || volume < 0) {
      await message.reply({
        content: `Volume cannot be more than 100 and less than 0`,
      });
      return;
    }

    await this.services.musicService.setVolume(message, volume);

    await message.reply({
      content: `Volume set to ${volume}`,
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const volume = interaction.options.getInteger('volume', true);

    // check if volume is not more than 100 or less than 0
    if (volume > 100 || volume < 0) {
      await interaction.reply({
        content: `Volume cannot be more than 100 and less than 0`,
      });
      return;
    }

    await this.services.musicService.setVolume(interaction, volume);

    await interaction.reply({
      content: `Volume set to ${volume}`,
    });
  }
}
