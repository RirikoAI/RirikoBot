module.exports = {
  // Set the language of the bot
  LANGUAGE: "en",
  embedColor: "ffc0cb", //hex color code

  // Discord related config. Create a new Application and create a bot with it. https://discord.com/developers/applications
  DISCORD: {
    // Prefix of the bot, used for General Purpose part of the bot
    Prefix: "=",

    // Discord bot token. Under the Bot tab. Please prefer setting this in the .env file instead of here
    Token: "",

    // The discord bot client ID under the General Information tab.  Please prefer setting this in the .env file instead of here
    ID: "",

    // Discord user IDs for permissions and ownerships
    Users: {
      // Discord IDs for owners of the bot
      Owners: [],
      // Discord IDs for those allowed to use the AI. Ignored if AI.EnableWhitelist = false
      AIAllowedUsers: [],
    },
  },

  // AI related config
  AI: {
    // Prefix of the AI part of the bot
    Prefix: "!",

    // The provider to use for the bot
    Provider: "",

    // Provider Token
    Token: "",

    // Enable or disable the Whitelist.
    EnableWhitelist: true,
  },

  DATABASE: {
    // Database engine to use. Must be one of: sqlite, mongodb, mysql
    Engine: "mongodb",
    // MongoDB related configs
    MongoDB: {
      // The MongoDB access URI, example: mongodb+srv://user:password@example.net
      AccessURI: "",
    },
  },

  DEBUG: {
    // 0 = most basic logging, 1 = Some more logging, 2 = Even more logging, 3 = Gib me all the LOGS!
    Level: 0,
    // start
    LogDir: "logs",
  },

  // ---------------------------------------------- music bot config ---------------------------------------------------

  sponsor: {
    status: true, //true or false
    url: "https://angel.net.my", //write your discord sponsor url.
  },

  voteManager: {
    //optional
    status: false, //true or false
    api_key: "", //write your top.gg api key.
    vote_commands: [
      "back",
      "channel",
      "clear",
      "dj",
      "filter",
      "loop",
      "nowplaying",
      "pause",
      "play",
      "playlist",
      "queue",
      "resume",
      "save",
      "search",
      "skip",
      "stop",
      "time",
      "volume",
    ], //write your use by vote commands.
    vote_url: "", //write your top.gg vote url.
  },

  shardManager: {
    shardStatus: false, //If your bot exists on more than 1000 servers, change this part to true.
  },

  playlistSettings: {
    maxPlaylist: 10, //max playlist count
    maxMusic: 75, //max music count
  },

  opt: {
    DJ: {
      commands: [
        "back",
        "clear",
        "filter",
        "loop",
        "pause",
        "resume",
        "skip",
        "stop",
        "volume",
        "shuffle",
      ], //Please don't touch
    },

    voiceConfig: {
      leaveOnFinish: false, //If this variable is "true", the bot will leave the channel the music ends.
      leaveOnStop: false, //If this variable is "true", the bot will leave the channel when the music is stopped.

      leaveOnEmpty: {
        status: false,
        cooldown: 10000000, //1000 = 1 second
      },
    },

    maxVol: 150, //You can specify the maximum volume level.
  },
};
