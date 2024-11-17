import { Injectable } from '@nestjs/common';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  CommandButtons,
  DiscordInteraction,
  DiscordMessage,
  MenuOptions,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { Client, Song } from 'genius-lyrics';
import { EmbedBuilder } from 'discord.js';

@Injectable()
export default class LyricsCommand extends Command implements CommandInterface {
  name = 'lyrics';
  regex = new RegExp('^lyrics$|^lyrics ', 'i');
  description = 'Get the lyrics of the current song or a song by name.';
  category = 'music';
  usageExamples = ['lyrics', 'lyrics <songname>'];

  buttons: CommandButtons = {
    lyrics: this.handleButton,
  };

  slashOptions = [
    {
      name: 'song',
      description: 'The name of the song to search for',
      type: SlashCommandOptionTypes.String,
      required: false,
    },
  ];

  searches: {
    userId: string;
    searches: Song[];
  }[] = [];

  async runPrefix(message: DiscordMessage): Promise<void> {
    await this.handleLyricsRequest(message as any as DiscordInteraction);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    // check if the user has entered search string option
    if (interaction.options.getString('song')) {
      this.params = [interaction.options.getString('song')];
    }
    await this.handleLyricsRequest(interaction);
  }
  
  async handleButton(interaction: DiscordInteraction): Promise<void> {
    await this.handleLyricsRequest(interaction);
  }

  async handleLyricsRequest(interaction: DiscordInteraction): Promise<void> {
    const songName =
      this.params.length === 0
        ? await this.getCurrentSongName(interaction.guildId)
        : this.params.join(' ');

    if (!songName) {
      if (!interaction.reply) {
        await interaction.channel.send({
          content: 'There is no song playing right now.',
        });
        return;
      }

      await interaction.reply({
        content: 'There is no song playing right now.',
        ephemeral: true,
      });
      return;
    }

    let userId: string;
    if (interaction.user) {
      userId = interaction.user.id;
    } else {
      userId = (interaction as any as DiscordMessage).author.id;
    }

    let reply;
    if (interaction.reply) {
      reply = await interaction.reply('Searching for lyrics...');
    } else {
      reply = await interaction.channel.send('Searching for lyrics...');
    }

    try {
      const searches = await this.getSongList(songName);

      if (!this.searches.find((search) => search.userId === userId)) {
        this.searches.push({
          userId: userId,
          searches,
        });
      } else {
        this.searches.find((search) => search.userId === userId).searches =
          searches;
      }

      if (!searches.length) {
        await reply.edit({
          content: 'No lyrics found for the current song.',
        });
        return;
      }
      
      reply.edit({
        content: `Lyrics for ${songName} found:`,
      });
      
      await this.createMenu({
        interaction,
        text: `Please select which lyrics to view`,
        options: searches.map((song) => ({
          label: song.title,
          value: searches.indexOf(song).toString(),
          description: song.artist.name,
        })) as MenuOptions,
        callback: this.handleSongSelection.bind(this),
        followUp: true,
        deleteAfterSelection: true,
      });
    } catch (e) {
      console.error(e);
    }
  }

  async getCurrentSongName(guildId: string): Promise<string | null> {
    const currentQueue = await this.player.getQueue(guildId);
    if (!currentQueue || !currentQueue.playing) {
      return null;
    }
    return currentQueue.songs[0].name;
  }

  async getSongList(songName: string): Promise<Song[]> {
    const client = new Client();
    return await client.songs.search(songName);
  }

  async handleSongSelection(
    interaction: DiscordInteraction,
    selectedOption: string,
  ): Promise<void> {
    const search = this.searches.find(
      (search) => search.userId === interaction.user.id,
    )?.searches;
    const lyrics = await search[selectedOption].lyrics();

    const embed = new EmbedBuilder()
      .setTitle('Lyrics')
      .setAuthor({ name: 'Genius Lyrics' })
      .setDescription(lyrics)
      .setURL(search[selectedOption].url)
      .setImage(search[selectedOption].thumbnail)
      .setFields([
        { name: 'Title', value: search[selectedOption].title },
        { name: 'Artist', value: search[selectedOption].artist.name },
      ])
      .setFooter({ text: 'Made with ❤️ by Ririko' })
      .setTimestamp()
      .setColor('#FFFFFF');

    await interaction.channel.send({ embeds: [embed] });
  }
}
