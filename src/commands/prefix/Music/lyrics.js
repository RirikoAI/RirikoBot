const { EmbedBuilder } = require("discord.js");
const Genius = require("genius-lyrics");
const {
  geniusToken,
  geniusEnabled,
  lyristEnabled,
} = require("../../../helpers/getconfig");

import { RirikoLyrist } from "app/RirikoLyrist";

const GeniusClient = new Genius.Client(geniusToken()); // Scrapes if no key is provided

const LyristClient = new RirikoLyrist();

module.exports = {
  config: {
    name: "lyrics",
    description: "Search for the lyrics by the given song title.",
    usage: "lyrics [song title]",
  },
  category: "Music",
  owner: false,
  run: async (client, message, args, prefix, config, db) => {
    const queue = client.player.getQueue(message);
    let search;

    if (!args[0]) {
      if (!queue) {
        return message.reply("Please enter a song title");
      } else {
        search = queue.songs[0].name;
      }
    } else {
      search = args.join(" ");
    }

    if (lyristEnabled()) {
      LyristClient.search(search).then(async (lyrics) => {
        message.channel.send(
          "Found lyrics for " +
            lyrics.artist +
            " - " +
            lyrics.title +
            ". Thanks to Lyrist."
        );

        for (let i = 0; i < lyrics.lyrics.length; i += 2000) {
          const toSend = lyrics.lyrics.substring(
            i,
            Math.min(lyrics.lyrics.length, i + 2000)
          );
          const lyricsEmbed = new EmbedBuilder()
            .setColor("#ffff00")
            .setTitle(`Lyrics - ${lyrics.title} by ${lyrics.artist}:`)
            .setDescription(toSend);

          if (lyrics?.image)
            lyricsEmbed.setImage(lyrics?.image).setAuthor({
              iconURL: lyrics.image,
              name: lyrics.artist,
            });
          message.channel.send({ embeds: [lyricsEmbed] });
        }
      });
      return;
    }

    if (geniusEnabled()) {
      GeniusClient.songs
        .search(search)
        .then(async (searches) => {
          const song = searches[0];
          const lyrics = await song.lyrics();
          if (lyrics.includes("<div>") || lyrics.includes("<div")) {
            message.channel.send(
              "Something went wrong when processing " +
                song.name +
                ". Try playing the music directly here: " +
                song.source
            );
            return;
          }

          message.channel.send(
            "Found lyrics for " +
              song.artist.name +
              " - " +
              song.title +
              ". Thanks to Genius."
          );

          for (let i = 0; i < lyrics.length; i += 2000) {
            const toSend = lyrics.substring(
              i,
              Math.min(lyrics.length, i + 2000)
            );
            const lyricsEmbed = new EmbedBuilder()
              .setColor("#ffff00")
              .setTitle(`Lyrics - ${song.title} by ${song.artist.name}:`)
              .setURL(`${song.url}`)
              .setDescription(toSend);

            if (song.artist?.image) lyricsEmbed.setThumbnail(song.artist.image);

            if (song.artist?.thumbnail)
              lyricsEmbed.setImage(song.artist.thumbnail).setAuthor({
                iconURL: song.artist.thumbnail,
                name: song.artist.name,
                url: song.artist.url,
              });
            message.channel.send({ embeds: [lyricsEmbed] });
          }
        })
        .catch((e) => {
          console.error(
            "Error when trying to get/send lyrics from Genius. You should try to setup Lyrist (check our Github) if this continue to persists.",
            e
          );
        });
    }

    message.reply(
      "Sorry, but I couldn't find the lyrics for the given song name."
    );
  },
};
