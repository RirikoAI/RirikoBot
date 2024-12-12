import { Injectable } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';

/**
 * LeaveCommand
 * @description Command that leaves the voice channel
 * @category Command
 */
@Injectable()
export default class LeaveCommand extends Command implements CommandInterface {
  name = 'leave';
  regex = new RegExp('^leave$', 'i');
  description = 'Leave a voice channel';
  category = 'music';
  usageExamples = ['leave'];

  async runPrefix(message: DiscordMessage): Promise<void> {
    this.player.voices.leave(message);

    await message.reply({
      content: 'Left the voice channel',
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    this.player.voices.leave(interaction);

    await interaction.reply({
      content: 'Left the voice channel',
    });
  }
}
