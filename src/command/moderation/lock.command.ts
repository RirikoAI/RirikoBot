import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordMessage } from '#command/command.types';
import { DiscordPermissions } from '#util/features/permissions.util';
import { EmbedBuilder, TextChannel } from 'discord.js';

/**
 * LockCommand
 * @description Lock a channel.
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
export default class LockCommand extends Command implements CommandInterface {
  name = 'lock';
  regex = new RegExp('^lock$', 'i');
  description = 'Lock a channel.';
  category = 'moderation';
  usageExamples = ['lock'];

  permissions: DiscordPermissions = ['ManageChannels'];

  async runPrefix(message: DiscordMessage) {
    await this.lockChannel(message.channel.id);
    const embed = new EmbedBuilder()
      .setTitle('Channel Locked')
      .setDescription('This channel has been locked.')
      .setColor('#ff0000');

    await message.reply({
      embeds: [embed],
    });
  }

  async runSlash(interaction) {
    await this.lockChannel(interaction.channel.id);
    const embed = new EmbedBuilder()
      .setTitle('Channel Locked')
      .setDescription('This channel has been locked.')
      .setColor('#ff0000');

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  async lockChannel(channelId: string) {
    this.client.channels.fetch(channelId).then((channel: TextChannel) => {
      channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        SendMessages: false,
      });
    });
  }
}
