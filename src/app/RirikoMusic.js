const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { DisTube } = require("distube");
const { SpotifyPlugin } = require("@distube/spotify");
const { SoundCloudPlugin } = require("@distube/soundcloud");
const { DeezerPlugin } = require("@distube/deezer");
const { YtDlpPlugin } = require("@distube/yt-dlp");
const config = require("config");

class RirikoMusic {
  /**
   *
   * @param client discord.js client
   */
  constructor(client) {
    this.client = client;
  }

  createPlayer(lang) {
    const distube = new DisTube(this.client, {
      leaveOnStop: config.opt.voiceConfig.leaveOnStop,
      leaveOnFinish: config.opt.voiceConfig.leaveOnFinish,
      emitNewSongOnly: true,
      emitAddSongWhenCreatingQueue: false,
      emitAddListWhenCreatingQueue: false,
      plugins: [
        new SpotifyPlugin(),
        new SoundCloudPlugin(),
        new YtDlpPlugin(),
        new DeezerPlugin(),
      ],
    });

    this.player = this.registerEvents(distube);
    return this.player;
  }

  registerEvents(distube) {
    // DisTube event listeners, more in the documentation page
    distube
      .on("playSong", (queue, song) =>
        queue.textChannel?.send(
          `Playing \`${song.name}\` - \`${song.formattedDuration}\`\nRequested by: ${song.user}`
        )
      )
      .on("addSong", (queue, song) =>
        queue.textChannel?.send(
          `Added ${song.name} - \`${song.formattedDuration}\` to the queue by ${song.user}`
        )
      )
      .on("addList", (queue, playlist) =>
        queue.textChannel?.send(
          `Added \`${playlist.name}\` playlist (${playlist.songs.length} songs) to queue\n`
        )
      )
      .on("error", (textChannel, e) => {
        console.error(e);
        textChannel.send(`An error encountered: ${e.message.slice(0, 2000)}`);
      })
      .on("finish", (queue) => queue.textChannel?.send("Finish queue!"))
      .on("finishSong", (queue) => queue.textChannel?.send("Finish song!"))
      .on("disconnect", (queue) => queue.textChannel?.send("Disconnected!"))
      .on("empty", (queue) =>
        queue.textChannel?.send(
          "The voice channel is empty! Leaving the voice channel..."
        )
      )
      // DisTubeOptions.searchSongs > 1
      .on("searchResult", (message, result) => {
        let i = 0;
        message.channel.send(
          `**Choose an option from below**\n${result
            .map(
              (song) =>
                `**${++i}**. ${song.name} - \`${song.formattedDuration}\``
            )
            .join("\n")}\n*Enter anything else or wait 30 seconds to cancel*`
        );
      })
      .on("searchCancel", (message) =>
        message.channel.send("Searching canceled")
      )
      .on("searchInvalidAnswer", (message) =>
        message.channel.send("Invalid number of result.")
      )
      .on("searchNoResult", (message) =>
        message.channel.send("No result found!")
      )
      .on("searchDone", () => {});

    return distube;
  }
}

module.exports = {
  RirikoMusic,
};
