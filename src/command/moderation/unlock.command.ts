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
export default class UnlockCommand extends Command implements CommandInterface {
  name = 'unlock';
  regex = new RegExp('^unlock$', 'i');
  description = 'Unlock a channel.';
  category = 'moderation';
  usageExamples = ['unlock'];

  permissions: DiscordPermissions = ['ManageChannels'];

  async runPrefix(message: DiscordMessage) {
    await this.unlockChannel(message.channel.id);
    const embed = new EmbedBuilder()
      .setTitle('Channel Locked')
      .setDescription('This channel has been unlocked for everyone.')
      .setColor('#00ff00');

    await message.reply({
      embeds: [embed],
    });
  }

  async runSlash(interaction) {
    await this.unlockChannel(interaction.channel.id);
    const embed = new EmbedBuilder()
      .setTitle('Channel Unlocked')
      .setDescription('This channel has been unlocked for everyone.')
      .setColor('#00ff00');

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  async unlockChannel(channelId: string) {
    this.client.channels.fetch(channelId).then((channel: TextChannel) => {
      channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
        SendMessages: true,
      });
    });
  }
}
