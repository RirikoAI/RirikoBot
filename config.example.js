module.exports = {
  // Discord related config. Create a new Application and create a bot with it. https://discord.com/developers/applications
  DISCORD: {
    // Prefix of the bot, used for General Purpose part of the bot
    Prefix: "!",

    // Discord bot token. Under the Bot tab
    Token: "",

    // The discord bot client ID under the General Information tab
    ID: "",

    // Discord user IDs for permissions and ownerships
    Users: {
      // Discord IDs for owners of the bot
      Owners: ["discord id 1", "discord id 2"],
      // Discord IDs for those allowed to use the AI. Ignored if AI.enableWhitelist = true
      AI_allowed_users: ["discord id 1"],
    },
  },

  // AI related config
  AI: {
    // Prefix of the AI part of the bot
    Prefix: ".",

    // The provider to use for the bot
    Provider: "NLPCloudProvider",

    // The provider API token
    Token: "",
  },

  DATABASE: {
    // Database engine to use. Must be one of: sqlite, mongodb, mysql
    Use: "mongodb",
    // MongoDB related configs
    MongoDB: {
      // The MongoDB access URI, example: mongodb+srv://user:password@example.net
      accessURI: "",
    },
  },

  DEBUG: {
    // 0 = most basic logging, 1 = Some more logging, 2 = Even more logging, 3 = Gib me all the LOGS!
    logLevel: 0,
    // start
    logDirectory: "logs",
  },
};
