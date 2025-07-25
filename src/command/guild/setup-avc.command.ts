import { Injectable } from '@nestjs/common';
import { EmbedBuilder, ChannelType } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { DiscordPermissions } from '#util/features/permissions.util';

/**
 * SetupAvcCommand
 * @description Command to setup auto voice channel
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
    await this.setupVoiceChannel(message.guild, message.channel);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    await this.setupVoiceChannel(interaction.guild, interaction.channel);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Auto Voice Channel')
          .setDescription('Auto voice channel has been set up!'),
      ],
    });
  }

  private async setupVoiceChannel(guild: any, channel: any): Promise<void> {
    const voiceChannel = await guild.channels.create({
      type: ChannelType.GuildVoice,
      name: '🔊 Join To Create',
    });

    await this.db.voiceChannelRepository.insert({
      id: voiceChannel.id,
      name: voiceChannel.name,
      parentId: '0',
      guild: {
        id: guild.id,
      },
    });

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('Auto Voice Channel')
          .setDescription('Auto voice channel has been set up!'),
      ],
    });
  }
}
