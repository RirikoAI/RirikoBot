import { Injectable } from '@nestjs/common';
import {
  ChannelType,
  TextChannel,
} from 'discord.js';
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
export default class SetupMusicCommand
  extends Command
  implements CommandInterface
{
  name = 'setup-music';
  regex = new RegExp('^setup-music$', 'i');
  description = 'Setup the music bot in your server';
  category = 'music';
  usageExamples = ['setup-music'];

  buttons: CommandButtons = {
    // playlists: this.handleButton,
  };

  async runPrefix(message: DiscordMessage): Promise<void> {
    // setup music bot channel
    await this.setupMusicChannel(message);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    // setup music bot channel
    await this.setupMusicChannel(interaction);
  }

  async handleButton(interaction: DiscordInteraction): Promise<void> {
    await interaction.reply({
      content: `Button ${interaction.customId} clicked`,
      ephemeral: false,
    });
  }

  /**
   * Set up the music bot channel. Discord.js v14.
   * @param {DiscordMessage | DiscordInteraction} interaction - The message or interaction object.
   */
  async setupMusicChannel(
    interaction: DiscordMessage | DiscordInteraction,
  ): Promise<void> {
    // check if user has permission to manage channels
    if (!interaction.member.permissions.has('MANAGE_CHANNELS')) {
      await interaction.reply({
        content: 'You do not have permission to manage channels.',
        ephemeral: true,
      });
      return;
    }

    // get the music channel
    let musicChannel = interaction.guild.channels.cache.find(
      (channel) => channel.name === 'music-channel',
    );

    // if music channel exists
    if (!musicChannel) {
      // create the music channel. Discord.js v14
      musicChannel = await interaction.guild.channels.create({
        name: 'music-channel',
        type: ChannelType.GuildText,
      });
    } else {
      // delete all messages in the music channel
      const messages = await (musicChannel as TextChannel).messages.fetch();
      await Promise.all(messages.map((message) => message.delete()));
    }

    await this.services.musicService.setupMusicChannel({
      interaction,
      musicChannel,
    });
  }
}
