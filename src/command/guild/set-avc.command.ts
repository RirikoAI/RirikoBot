import { Injectable } from '@nestjs/common';
import { EmbedBuilder, ChannelType } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordMessage } from '#command/command.types';

/**
 * Ping command.
 * @description Use this as a template for creating new commands.
 * @category Command
 */
@Injectable()
export default class SetAvcCommand extends Command implements CommandInterface {
  name = 'set-avc';
  regex = new RegExp('^set-avc$|^setup-avc$', 'i');
  description = 'Setup auto voice channel';
  category = 'guild';
  usageExamples = ['set-avc', 'setup-avc'];

  async runPrefix(message: DiscordMessage): Promise<void> {
    // create a new voice channel in the guild
    const channel = await message.guild.channels.create({
      type: ChannelType.GuildVoice,
      name: '🔊 Join To Create',
    });

    // push the new voice channel to the database
    await this.services.voiceChannelRepository.insert({
      id: channel.id,
      name: channel.name,
      parentId: '0',
      guild: {
        id: message.guild.id,
      },
    });

    // send a success message
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('Auto Voice Channel')
          .setDescription('Auto voice channel has been set up!'),
      ],
    });
  }
}
