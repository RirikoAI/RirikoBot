const { EmbedBuilder } = require("discord.js");
const sl = require("songlyrics").default;

module.exports = {
  config: {
    name: "lyrics",
    description: "Search for the lyrics by the given song title.",
    usage: "lyrics [song title]",
  },
  permissions: ["Administrator"],
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

    sl(search)
      .then((lyrics) => {
        if (lyrics.lyrics.includes("<div>") || lyrics.lyrics.includes("<div")) {
          message.channel.send(
            "Something went wrong when processing " +
              lyrics.source.name +
              ". Try playing the music directly here: " +
              lyrics.source.link
          );
          return;
        }

        message.channel.send(
          "Found lyrics for " +
            lyrics.title +
            ". Thanks to " +
            lyrics.source.name
        );

        for (let i = 0; i < lyrics.lyrics.length; i += 2000) {
          const toSend = lyrics.lyrics.substring(
            i,
            Math.min(lyrics.lyrics.length, i + 2000)
          );
          const lyricsEmbed = new EmbedBuilder()
            .setColor("#ffff00")
            .setTitle(`Lyrics`)
            .setDescription(toSend);
          message.channel.send({ embeds: [lyricsEmbed] });
        }
      })
      .catch(() => {
        message.reply(
          "Sorry, but I couldn't find the lyrics for the given song name."
        );
      });
  },
};
