import { Injectable } from '@nestjs/common';
import { EmbedBuilder, ChannelType } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordMessage } from '#command/command.types';
import { DiscordPermissions } from '#util/features/permissions.util';

/**
 * Ping command.
 * @description Use this as a template for creating new commands.
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export default class SetupAvcCommand
  extends Command
  implements CommandInterface
{
  name = 'setup-avc';
  regex = new RegExp('^setup-avc$|^set-avc$', 'i');
  description = 'Setup auto voice channel';
  category = 'guild';
  usageExamples = ['setup-avc', 'set-avc'];

  permissions: DiscordPermissions = ['ManageGuild'];

  async runPrefix(message: DiscordMessage): Promise<void> {
    // create a new voice channel in the guild
    const channel = await message.guild.channels.create({
      type: ChannelType.GuildVoice,
      name: '🔊 Join To Create',
    });

    // push the new voice channel to the database
    await this.db.voiceChannelRepository.insert({
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
