import { Injectable } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  CommandButtons,
  DiscordInteraction,
  SlashCommandOptionTypes,
} from '#command/command.types';

/**
 * MemberInfoCommand
 * @description Discord command to get information about a member or yourself
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
@Injectable()
export default class PlaylistCommand
  extends Command
  implements CommandInterface
{
  name = 'playlist';
  regex = new RegExp('^playlist$|^playlist ', 'i');
  description = 'Get playlist information.';
  category = 'music';
  usageExamples = ['playlist'];

  buttons: CommandButtons = {
    playlists: this.handleListPlaylists,
  };

  slashOptions = [
    {
      name: 'create',
      description: 'Create a playlist.',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'name',
          description: 'TWrite the name of the playlist you want to create.',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
        {
          name: 'public',
          description:
            'Make the playlist public. (true=public playlist, false=private playlist)',
          type: SlashCommandOptionTypes.Boolean,
          required: true,
        },
      ],
    },
    {
      name: 'delete',
      description: 'Delete a playlist.',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'name',
          description: 'Write the name of the playlist you want to delete.',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
      ],
    },
    {
      name: 'add-music',
      description: 'It allows you to add music to the playlist.',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'playlist-name',
          description: 'Write a playlist name.',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
        {
          name: 'name',
          description: 'Write a music name or a music link.',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
      ],
    },
    {
      name: 'delete-music',
      description: 'It allows you to delete music to the playlist.',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'playlist-name',
          description: 'Write a playlist name.',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
        {
          name: 'name',
          description: 'Write a music name.',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
      ],
    },
    {
      name: 'list',
      description: 'Browse music in a playlist.',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'name',
          description: 'Write a playlist name.',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
      ],
    },
    {
      name: 'lists',
      description: 'Browse all your playlists.',
      type: SlashCommandOptionTypes.Subcommand,
      options: [],
    },
  ];

  maxMusic = 300;
  maxPlaylist = 300;

  async runSlash(interaction: DiscordInteraction): Promise<any> {
    try {
      const subCommand = interaction.options.getSubcommand();
      switch (subCommand) {
        case 'create':
          return this.handleCreatePlaylist(interaction);
        case 'delete':
          return this.handleDeletePlaylist(interaction);
        case 'add-music':
          return this.handleAddMusic(interaction);
        case 'delete-music':
          return this.handleDeleteMusic(interaction);
        case 'list':
          return this.handleListTracks(interaction);
        case 'lists':
          return this.handleListPlaylists(interaction);
        default:
          throw new Error('Unknown subcommand');
      }
    } catch (error) {
      console.error(error);
      return interaction.reply({
        content: 'An error occurred while processing your request. ❌',
        ephemeral: true,
      });
    }
  }

  // Utility methods
  private async fetchUserPlaylists(userId: string) {
    return this.db.playlistRepository.find({ where: { userId } });
  }

  private async fetchPlaylist(userId: string, playlistName: string) {
    return this.db.playlistRepository.findOne({
      where: { userId, name: playlistName },
    });
  }

  private async handleError(interaction, message: string) {
    if (interaction.deferred || interaction.replied) {
      interaction.channel.send({ content: message });
    } else {
      interaction.reply({ content: message, ephemeral: true });
    }
  }

  // Handlers for each subcommand
  private async handleCreatePlaylist(interaction: DiscordInteraction) {
    const playlistName = interaction.options.getString('name');
    const isPublic = interaction.options.getBoolean('public');

    if (!playlistName) {
      return this.handleError(
        interaction,
        'Write the name of the playlist you want to create. ❌',
      );
    }

    const userPlaylists = await this.fetchUserPlaylists(interaction.user.id);

    if (userPlaylists.length >= this.maxPlaylist) {
      return this.handleError(
        interaction,
        "You can't have more than 300 playlists. ❌",
      );
    }

    if (userPlaylists.some((p) => p.name === playlistName)) {
      return this.handleError(
        interaction,
        'You already have a playlist with this name. ❌',
      );
    }

    await interaction.reply({ content: 'Creating playlist... 🎧' });
    await this.db.playlistRepository.insert({
      userId: interaction.user.id,
      name: playlistName,
      public: isPublic,
      author: interaction.user.id,
      authorTag: interaction.user.tag,
      plays: 0,
      createdAt: Date.now(),
    });

    return interaction.editReply({ content: 'Playlist created! 🎧' });
  }

  private async handleDeletePlaylist(interaction: DiscordInteraction) {
    const playlistName = interaction.options.getString('name');
    if (!playlistName) {
      return this.handleError(
        interaction,
        'Write the name of the playlist you want to delete. ❌',
      );
    }

    const playlist = await this.fetchPlaylist(
      interaction.user.id,
      playlistName,
    );
    if (!playlist) {
      return this.handleError(
        interaction,
        "You don't have a playlist with this name. ❌",
      );
    }

    await interaction.reply({ content: 'Deleting playlist... 🎧' });

    await this.db.trackRepository.delete({ playlist });
    await this.db.playlistRepository.delete({
      userId: interaction.user.id,
      name: playlistName,
    });

    return interaction.editReply({ content: 'Playlist deleted! 🎧' });
  }

  private async handleAddMusic(interaction: DiscordInteraction) {
    const trackName = interaction.options.getString('name');
    const playlistName = interaction.options.getString('playlist-name');

    if (!trackName || !playlistName) {
      return this.handleError(
        interaction,
        'Provide both track and playlist names. ❌',
      );
    }

    const playlist = await this.fetchPlaylist(
      interaction.user.id,
      playlistName,
    );
    if (!playlist) {
      return this.handleError(
        interaction,
        "You don't have a playlist with this name. ❌",
      );
    }

    if (playlist.tracks.length >= this.maxMusic) {
      return this.handleError(
        interaction,
        `You can't have more than ${this.maxMusic} tracks in a playlist. ❌`,
      );
    }

    await interaction.reply({ content: 'Adding music... 🎧' });
    const searchResult = await this.player.search(trackName);

    if (!searchResult[0].name) {
      return this.handleError(interaction, 'Track not found! ❌');
    }

    // check if the track is already in the playlist
    const existingTrack = playlist.tracks.find(
      (m) => m.name === searchResult[0].name,
    );
    if (existingTrack) {
      return interaction.editReply({
        content: 'This music is already in this playlist. ❌',
      });
    }

    await this.db.trackRepository.insert({
      name: searchResult[0].name,
      url: searchResult[0].url,
      playlist,
    });

    return interaction.editReply({
      content: `\`${searchResult[0].name}\` added to the playlist! 🎧`,
    });
  }

  private async handleDeleteMusic(interaction: DiscordInteraction) {
    const name = interaction.options.getString('name');
    if (!name)
      return interaction
        .reply({
          content: 'Write the name of the track you want to search. ❌',
          ephemeral: true,
        })
        .catch((e) => {});
    const playlist_name = interaction.options.getString('playlist-name');
    if (!playlist_name)
      return interaction
        .reply({
          content:
            'Write the name of the playlist you want to delete the music from. ❌',
          ephemeral: true,
        })
        .catch((e) => {});

    // Check if the playlist with the name exists
    const playlist = await this.db.playlistRepository.findOne({
      where: { userId: interaction.user.id, name: playlist_name },
    });

    if (!playlist)
      return interaction
        .reply({
          content: "You don't have a playlist with this name. ❌",
          ephemeral: true,
        })
        .catch((e) => {});

    const music_filter = playlist?.tracks?.filter(
      (m) => m.playlist?.name === playlist_name && m?.name === name,
    );
    if (!(music_filter?.length > 0))
      return interaction
        .reply({
          content: "You don't have a music with this name. ❌",
          ephemeral: true,
        })
        .catch((e) => {});

    await interaction
      .reply({
        content: `<@${interaction.member.id}>, Deleting music... 🎧`,
      })
      .catch((e) => {});

    // Delete the music from the playlist
    await this.db.trackRepository.delete({
      name: name,
      playlist: playlist,
    });

    await interaction
      .editReply({
        content: `<@${interaction.member.id}>, Music deleted! 🎧`,
      })
      .catch((e) => {});
  }

  private async handleListTracks(interaction: DiscordInteraction) {
    const playlistName = interaction.options.getString('name');
    if (!playlistName)
      return interaction
        .reply({
          content: 'Write the name of the playlist you want to search. ❌',
          ephemeral: true,
        })
        .catch((e) => {});

    let tracks: any;

    const playlist = await this.db.playlistRepository.find({
      where: { name: playlistName },
    });

    if (!(playlist?.length > 0))
      return interaction
        .reply({
          content: 'No playlist found with this name. ❌',
          ephemeral: true,
        })
        .catch((e) => {});

    for (let i = 0; i < playlist.length; i++) {
      if (playlist[i].tracks.length > 0) {
        const playlistOwner = playlist[i].author;
        const playlistIsPublic = playlist[i].public;

        if (playlistOwner !== interaction.member?.id) {
          if (playlistIsPublic === false) {
            return interaction
              .reply({
                content:
                  "You don't have permission to view / play this playlist. ❌",
                ephemeral: true,
              })
              .catch((e) => {});
          }
        }

        tracks = playlist[i]?.tracks;
        if (!(tracks?.length > 0))
          return interaction
            .reply({
              content: 'No tracks found in this playlist. ❌',
              ephemeral: true,
            })
            .catch((e) => {});
      }
    }

    const backId = 'emojiBack';
    const forwardId = 'emojiForward';
    const backButton = new ButtonBuilder({
      style: ButtonStyle.Secondary,
      emoji: '⬅️',
      customId: backId,
    });

    const deleteButton = new ButtonBuilder({
      style: ButtonStyle.Secondary,
      emoji: '❌',
      customId: 'close',
    });

    const forwardButton = new ButtonBuilder({
      style: ButtonStyle.Secondary,
      emoji: '➡️',
      customId: forwardId,
    });

    const howMany = 8;
    let page = 1;
    const a = tracks.length / howMany;

    const generateEmbed = async (start): Promise<any> => {
      let num = page === 1 ? 1 : page * howMany - howMany + 1;
      const current = tracks.slice(start, start + howMany);
      if (!current || !(current?.length > 0))
        return interaction
          .reply({
            content: "You don't have any music in this playlist. ❌",
            ephemeral: true,
          })
          .catch((e) => {});
      return new EmbedBuilder()
        .setTitle(`${playlistName}`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setColor('#ffffff')
        .setDescription(
          `$Use the **/play playlist <list-name>** command to listen to these playlists.
Type **/playlist list <list-name>** to see the music in a list.\n${current.map(
            (data) =>
              `\n\`${num++}\` | [${data.name}](${
                data.url
              }) - <t:${Math.floor((data.createdAt as any) / 1000)}:R>`,
          )}`,
        )
        .setFooter({ text: `Page ${page}/${Math.floor(a + 1)}` });
    };

    const canFitOnOnePage = tracks.length <= howMany;

    await (interaction as any)
      .reply({
        embeds: [await generateEmbed(0)],
        components: canFitOnOnePage
          ? []
          : [
              new ActionRowBuilder({
                components: [deleteButton, forwardButton],
              }),
            ],
        fetchReply: true,
      })
      .then(async (Message) => {
        const filter = (i) => i.user.id === interaction.user.id;
        const collector = Message.createMessageComponentCollector({
          filter,
          time: 65000,
        });

        let currentIndex = 0;
        collector.on('collect', async (button) => {
          if (button.customId === 'close') {
            collector.stop();
            return button
              .reply({
                content: 'The command processor has been cancelled. ✅',
                ephemeral: true,
              })
              .catch((e) => {});
          } else {
            if (button.customId === backId) {
              page--;
            }
            if (button.customId === forwardId) {
              page++;
            }

            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            button.customId === backId
              ? (currentIndex -= howMany)
              : (currentIndex += howMany);

            await interaction
              .editReply({
                embeds: [await generateEmbed(currentIndex)],
                components: [
                  new ActionRowBuilder({
                    components: [
                      ...(currentIndex ? [backButton] : []),
                      deleteButton,
                      ...(currentIndex + howMany < tracks.length
                        ? [forwardButton]
                        : []),
                    ],
                  }) as any,
                ],
              })
              .catch((e) => {});
            await button.deferUpdate().catch((e) => {});
          }
        });

        collector.on('end', async (button) => {
          const controlButtons = this.services.musicService.getControlButtons(
            backId,
            forwardId,
          );
          button = new ActionRowBuilder().addComponents(
            controlButtons.backButton,
            controlButtons.closeButton,
            controlButtons.forwardButton,
          );

          const embed = new EmbedBuilder()
            .setTitle(`${name}`)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setColor('#ffffff')
            .setDescription(
              'Your time has expired to use this command, you can type/playlist list ${name}to use the command again.',
            )
            .setFooter({ text: 'Made with ❤️ by Ririko' });
          return interaction
            .editReply({ embeds: [embed], components: [button] })
            .catch((e) => {});
        });
      })
      .catch((e) => {});
  }

  private async handleListPlaylists(interaction: DiscordInteraction) {
    const playlist = await this.db.playlistRepository.find({
      where: { userId: interaction.user.id },
    });

    if (!(playlist?.length > 0))
      return interaction
        .reply({
          content: "You don't have any playlist. ❌",
          ephemeral: true,
        })
        .catch((e) => {});

    let number = 1;
    let contents = '';

    for (let i = 0; i < playlist.length; i++) {
      contents += `\n**${number++} |** \`${playlist[i].name}\` - **${
        playlist[i].public ? 'Public' : 'Private'
      }** - **${playlist[i].tracks.length}** tracks - **${playlist[i].plays}** plays (<t:${Math.floor(
        (playlist[i].createdAt as any) / 1000,
      )}:R>)`;
    }

    const embed = new EmbedBuilder()
      .setAuthor({
        name: `${interaction.user.username}'s Playlists`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setColor('#ffffff')
      .setDescription(
        `Use the /play playlist <list-name> command to listen to these playlists.\nType /playlist list <list-name> to see the music in a list.\n${contents}`,
      )
      .setTimestamp()
      .setFooter({ text: 'Made with ❤️ by Ririko' });
    return interaction.reply({ embeds: [embed] }).catch((e) => {});
  }
}
