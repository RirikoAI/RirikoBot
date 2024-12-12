import { Injectable } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';

/**
 * Ping command.
 * @description Use this as a template for creating new commands.
 * @category Command
 */
@Injectable()
export default class PlayTopCommand
  extends Command
  implements CommandInterface
{
  name = 'playtop';
  regex = new RegExp('^playtop$|^playtop ', 'i');
  description = 'Play a song';
  category = 'music';
  usageExamples = ['playtop', 'playtop <song name>'];

  slashOptions = [
    {
      name: 'song',
      description: 'The song name',
      required: true,
      type: SlashCommandOptionTypes.String,
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    // check if allParams is empty
    if (this.allParams.length === 0) {
      await message.reply('Please provide a song name.');
      return;
    }

    const songName = this.allParams;

    // check if the music channel exists
    const textChannel = await this.findMusicChannel(message);

    if (!textChannel) {
      await message.reply(
        'Please set the music channel first. Run the `setup-music` command.',
      );
      return;
    }

    try {
      // play the song
      await this.player.play(
        message.member.voice.channel,
        songName.toString(),
        {
          member: message.member,
          textChannel: textChannel,
          message,
          position: 1,
        },
      );
    } catch (e) {
      await message.reply('Please join a voice channel to play a music');
    }
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    if (interaction.deferReply) {
      await interaction.deferReply();
    }

    const loading = await interaction.editReply({
      content: 'Loading command...',
    });

    // get the song name from the slash command
    const songName = interaction.options.getString('song');

    // check if songName is empty
    if (!songName) {
      await interaction.reply('Please provide a song name.');
      return;
    }

    // check if the music channel exists
    const textChannel = await this.findMusicChannel(interaction);

    if (!textChannel) {
      await interaction.reply(
        'Please set the music channel first. Run the `setup-music` command.',
      );
      return;
    }

    if (loading) {
      await loading.delete();
    }

    const reply = await interaction.channel.send({
      content: 'Playing song...',
    });

    try {
      // play the song
      await this.player.play(interaction.member.voice.channel, songName, {
        member: interaction.member,
        textChannel: textChannel,
        message: reply,
        position: 1,
      });
    } catch (e) {
      reply.edit({
        content: 'Please join a voice channel to play a music',
      });
    }
  }

  async findMusicChannel(
    message: DiscordMessage | DiscordInteraction,
  ): Promise<any> {
    // find the music channel of the guild from the db
    const musicChannel = await this.db.musicChannelRepository.findOne({
      where: {
        guild: {
          id: message.guild.id,
        },
      },
    });

    try {
      // get the music channel from discord
      return message.guild.channels.cache.get(musicChannel.id);
    } catch (e) {
      console.error(e);
      return false;
    }
  }
}
