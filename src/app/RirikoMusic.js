/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { DisTube } = require("distube");
const { SpotifyPlugin } = require("@distube/spotify");
const { SoundCloudPlugin } = require("@distube/soundcloud");
const { DeezerPlugin } = require("@distube/deezer");
const { YtDlpPlugin } = require("@distube/yt-dlp");
const config = require("config");
const { getLang } = require("helpers/language");
const getconfig = require("../helpers/getconfig");
const { QuickDB } = require("quick.db");
const db = new QuickDB();

/**
 * Ririko Music class to handle all Distube events
 *
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
class RirikoMusic {
  /**
   *
   * @param client discord.js client
   */
  constructor(client) {
    this.client = client;
    this.lang = getLang();
  }

  createPlayer() {
    const distube = new DisTube(this.client, {
      leaveOnStop: config.opt.voiceConfig.leaveOnStop,
      leaveOnFinish: config.opt.voiceConfig.leaveOnFinish,
      emitNewSongOnly: true,
      emitAddSongWhenCreatingQueue: false,
      emitAddListWhenCreatingQueue: false,
      leaveOnEmpty: config.opt.voiceConfig.leaveOnEmpty.status,
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
      .on("playSong", async (queue, song) => {
        let volume =
          +(await db.get(`guild_volume_${queue.textChannel.guild.id}`)) ||
          queue.volume ||
          50;

        if (volume < 0) {
          volume = 0;
        }

        queue.setVolume(volume);

        const embed = new EmbedBuilder();
        embed.setColor(this.client.config.embedColor);
        embed.setThumbnail(song.thumbnail);
        embed.setTitle("Now playing: " + song.name);
        embed.setDescription(`Volume: \`${queue.volume}%\`
Duration: \`${song.formattedDuration}\`
URL: **${song.url}**
By: <@${song.user.id}>`);

        embed.setTimestamp();
        embed.setFooter({ text: this.lang.footer1 });

        queue.textChannel?.send({ embeds: [embed] }).catch((e) => {});
      })
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

  getControlButtons(backId, forwardId) {
    return {
      backButton: new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⬅️")
        .setCustomId(backId)
        .setDisabled(true),
      closeButton: new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌")
        .setCustomId("close")
        .setDisabled(true),
      forwardButton: new ButtonBuilder()
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("➡️")
        .setCustomId(forwardId)
        .setDisabled(true),
    };
  }
}

module.exports = {
  RirikoMusic,
};
