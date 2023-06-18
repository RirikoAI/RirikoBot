const { ApplicationCommandOptionType, EmbedBuilder } = require("discord.js");
const db = require("../../../app/Schemas/MusicBot");
const { getLang } = require("../../../helpers/language");
module.exports = {
  name: "play",
  description: "Play a track.",
  permissions: "0x0000000000000800",
  type: 1,
  options: [
    {
      name: "music",
      description: "Open music from other platforms.",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "name",
          description: "Write your music name.",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
    {
      name: "playlist",
      description: "Write your playlist name.",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "name",
          description: "Write the name of the playlist you want to create.",
          type: ApplicationCommandOptionType.String,
          required: true,
        },
      ],
    },
  ],
  voiceChannel: true,
  /**
   * Command runner
   * @author umutxyp https://github.com/umutxyp/MusicBot
   * @author earnestangel https://github.com/RirikoAI/RirikoBot
   *
   * @param {import("discord.js").Client} client Discord.js client
   * @param {import("discord.js").Interaction} interaction
   *
   * @returns {Promise<*>}
   */
  run: async (client, interaction) => {
    let lang = getLang();

    if (interaction.member.voice.channel === null) {
      await interaction.reply(
        "You must be in a voice channel to play a music."
      );
      return;
    }

    try {
      let stp = interaction.options.getSubcommand();

      if (stp === "playlist") {
        let playlistw = interaction.options.getString("name");
        let playlist = await db?.playlist?.find().catch((e) => {});
        if (!playlist?.length > 0)
          return interaction
            .reply({ content: lang.msg52, ephemeral: true })
            .catch((e) => {});

        let arr = 0;
        for (let i = 0; i < playlist.length; i++) {
          if (
            playlist[i]?.playlist?.filter((p) => p.name === playlistw)?.length >
            0
          ) {
            let playlist_owner_filter = playlist[i].playlist.filter(
              (p) => p.name === playlistw
            )[0].author;
            let playlist_public_filter = playlist[i].playlist.filter(
              (p) => p.name === playlistw
            )[0].public;

            if (playlist_owner_filter !== interaction.member.id) {
              if (playlist_public_filter === false) {
                return interaction
                  .reply({ content: lang.msg53, ephemeral: true })
                  .catch((e) => {});
              }
            }

            const music_filter = playlist[i]?.musics?.filter(
              (m) => m.playlist_name === playlistw
            );
            if (!music_filter?.length > 0)
              return interaction
                .reply({ content: lang.msg54, ephemeral: true })
                .catch((e) => {});

            interaction.reply({ content: lang.msg56 }).catch((e) => {});

            let songs = [];
            music_filter.map((m) => songs.push(m.music_url));

            setTimeout(async () => {
              const playl = await client?.player?.createCustomPlaylist(songs, {
                member: interaction.member,
                properties: { name: playlistw, source: "custom" },
                parallel: true,
              });

              await interaction
                .editReply({
                  content: lang.msg57
                    .replace("{interaction.member.id}", interaction.member.id)
                    .replace("{music_filter.length}", music_filter.length),
                })
                .catch((e) => {});

              try {
                await client.player.play(
                  interaction.member.voice.channel,
                  playl,
                  {
                    member: interaction.member,
                    textChannel: interaction.channel,
                    interaction,
                  }
                );
              } catch (e) {
                console.info(e);
                await interaction
                  .editReply({ content: lang.msg60, ephemeral: true })
                  .catch((e) => {});
              }

              playlist[i]?.playlist
                ?.filter((p) => p.name === playlistw)
                .map(async (p) => {
                  await db.playlist
                    .updateOne(
                      { userID: p.author },
                      {
                        $pull: {
                          playlist: {
                            name: playlistw,
                          },
                        },
                      },
                      { upsert: true }
                    )
                    .catch((e) => {});

                  await db.playlist
                    .updateOne(
                      { userID: p.author },
                      {
                        $push: {
                          playlist: {
                            name: p.name,
                            author: p.author,
                            authorTag: p.authorTag,
                            public: p.public,
                            plays: Number(p.plays) + 1,
                            createdTime: p.createdTime,
                          },
                        },
                      },
                      { upsert: true }
                    )
                    .catch((e) => {});
                });
            }, 3000);
          } else {
            arr++;
            if (arr === playlist.length) {
              return interaction
                .reply({ content: lang.msg58, ephemeral: true })
                .catch((e) => {});
            }
          }
        }
      }

      if (stp === "music") {
        const name = interaction.options.getString("name");
        if (!name)
          return interaction
            .reply({ content: lang.msg59, ephemeral: true })
            .catch((e) => {});

        await interaction.reply({ content: lang.msg61 }).catch((e) => {});
        try {
          await client.player.play(interaction.member.voice.channel, name, {
            member: interaction.member,
            textChannel: interaction.channel,
            interaction,
          });
        } catch (e) {
          console.info(e);
          await interaction
            .editReply({ content: lang.msg60, ephemeral: true })
            .catch((e) => {});
        }
      }
    } catch (e) {
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};
