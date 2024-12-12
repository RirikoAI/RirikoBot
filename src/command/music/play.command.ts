import { Injectable } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  CommandButtons,
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
export default class PlayCommand extends Command implements CommandInterface {
  name = 'play';
  regex = new RegExp('^play$|^play ', 'i');
  description = 'Play a song';
  category = 'music';
  usageExamples = ['play', 'play <song name>'];

  buttons: CommandButtons = {
    play: this.handleButton,
  };

  slashOptions = [
    {
      name: 'music',
      description: 'Open music from other platforms.',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'name',
          description: 'Write your music name.',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
      ],
    },
    {
      name: 'playlist',
      description: 'Write your playlist name.',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'name',
          description: 'Write the name of the playlist you want to create.',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
      ],
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
        },
      );
    } catch (e) {
      if (e.message.includes('voiceChannel')) {
        await message.reply('Please join a voice channel to play a music');
        return;
      } else {
        console.error(e);
        await message.reply(
          'Something went wrong when trying to play the song',
        );
        return;
      }
    }
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const command = interaction.options.getSubcommand();

    if (command === 'music') {
      await this.playMusic(interaction);
    } else if (command === 'playlist') {
      await this.playPlaylist(interaction);
    }
  }

  async playMusic(interaction: DiscordInteraction): Promise<void> {
    if (interaction.deferReply) {
      await interaction.deferReply();
    }

    const loading = await interaction.editReply({
      content: 'Loading command...',
    });

    // get the song name from the interaction
    const songName = interaction.options.getString('name');

    // check if the music channel exists
    const textChannel = await this.findMusicChannel(interaction);

    if (!textChannel) {
      await interaction.reply({
        content:
          'Please set the music channel first. Run the `setup-music` command.',
        ephemeral: true,
      });
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
      });
    } catch (e) {
      if (e.message.includes('voiceChannel')) {
        await reply.edit({
          content: 'Please join a voice channel to play a music',
        });
      } else {
        console.error(e);
        await reply.edit({
          content: 'Something went wrong when trying to play the song',
        });
      }
    }
  }

  async playPlaylist(interaction: DiscordInteraction): Promise<any> {
    const loading = await interaction.reply('Loading command...');
    const playlistName = interaction.options.getString('name');

    const playlist = await this.db.playlistRepository.findOne({
      where: {
        name: playlistName,
        userId: interaction.member.id,
      },
    });

    if (!playlist) {
      try {
        return interaction.reply({
          content: 'Playlist not found.',
          ephemeral: true,
        });
      } catch (e) {}
    }

    if (!(playlist.tracks.length > 0)) {
      try {
        return interaction.reply({
          content: `The playlist ${playlist.name} has no tracks.`,
          ephemeral: true,
        });
      } catch (e) {}
    }

    const songs = [];
    playlist.tracks.map((m) => songs.push(m.url));

    const queuedPlaylist = await this.player.createCustomPlaylist(songs, {
      member: interaction.member,
      properties: { name: 'My playlist name' },
      parallel: true,
    } as any);
    try {
      await loading.delete();
      const reply = await interaction.channel.send(
        `Playing playlist ${playlist.name}...`,
      );

      await this.player.play(interaction.member.voice.channel, queuedPlaylist, {
        member: interaction.member,
        textChannel: await this.findMusicChannel(interaction),
        message: reply,
      });
    } catch (e) {
      try {
        await interaction.editReply({
          content: 'Something went wrong when trying to play the playlist',
        });
      } catch (e) {}
    }
  }

  async handleButton(interaction: DiscordInteraction): Promise<void> {
    await interaction?.deferUpdate();
    await this.services.musicService.resumeMusic(interaction);
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
