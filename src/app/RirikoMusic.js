const { Client, GatewayIntentBits, Partials } = require("discord.js");
const { DisTube } = require("distube");
const { SpotifyPlugin } = require("@distube/spotify");
const { SoundCloudPlugin } = require("@distube/soundcloud");
const { DeezerPlugin } = require("@distube/deezer");
const { YtDlpPlugin } = require("@distube/yt-dlp");
const config = require("config");

class RirikoMusic {
  static instance = null;

  static getInstance() {
    if (this.instance === null) {
      this.instance = new this();
    }
    return this.instance;
  }

  /**
   *
   * @param client discord.js client
   */
  constructor(client) {
    client.player = new DisTube(client, {
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
  }
}
