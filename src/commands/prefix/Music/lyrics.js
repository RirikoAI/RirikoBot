const { EmbedBuilder } = require("discord.js");
const Genius = require("genius-lyrics");

const Client = new Genius.Client(
  process.env.GENIUS_TOKEN ? process.env.GENIUS_TOKEN : ""
); // Scrapes if no key is provided

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

    Client.songs
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
          const toSend = lyrics.substring(i, Math.min(lyrics.length, i + 2000));
          const lyricsEmbed = new EmbedBuilder()
            .setColor("#ffff00")
            .setTitle(`Lyrics - ${song.title} by ${song.artist.name}:`)
            .setURL(`${song.url}`)
            .setDescription(toSend)
            .setAuthor({
              iconURL: song.artist.thumbnail,
              name: song.artist.name,
              url: song.artist.url,
            });

          if (song.artist?.image) lyricsEmbed.setThumbnail(song.artist.image);
          if (song.artist?.thumbnail)
            lyricsEmbed.setImage(song.artist.thumbnail);
          message.channel.send({ embeds: [lyricsEmbed] });
        }
      })
      .catch((e) => {
        console.error("Error when trying to get/send lyrics", e);
        message.reply(
          "Sorry, but I couldn't find the lyrics for the given song name."
        );
      });
  },
};
