import { Injectable } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';

/**
 * Leave a voice channel
 * @description Leave a voice channel
 * @category Command
 */
@Injectable()
export default class JoinCommand extends Command implements CommandInterface {
  name = 'join';
  regex = new RegExp('^join$', 'i');
  description = 'Join a voice channel';
  category = 'music';
  usageExamples = ['join'];

  async runPrefix(message: DiscordMessage): Promise<void> {
    const voiceChannel = message.member.voice.channel;
    await this.player.voices.join(voiceChannel);

    await message.reply({
      content: 'Joined the voice channel',
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const voiceChannel = interaction.member.voice.channel;
    await this.player.voices.join(voiceChannel);

    await interaction.reply({
      content: 'Joined the voice channel',
    });
  }
}
