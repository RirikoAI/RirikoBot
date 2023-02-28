module.exports = {
  // Set the language of the bot
  LANGUAGE: "en",

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
      Owners: ["1", "2"],
      // Discord IDs for those allowed to use the AI. Ignored if AI.EnableWhitelist = false
      AIAllowedUsers: ["1"],
    },
  },

  // AI related config
  AI: {
    // Prefix of the AI part of the bot
    Prefix: ".",

    // The provider to use for the bot
    Provider: "",

    // Provider Token
    Token: "",

    // Enable or disable the Whitelist.
    EnableWhitelist: true,
  },

  DATABASE: {
    // Database engine to use. Must be one of: sqlite, mongodb, mysql
    Use: "mongodb",
    // MongoDB related configs
    MongoDB: {
      // The MongoDB access URI, example: mongodb+srv://user:password@example.net
      AccessURI: "",
    },
  },

  DEBUG: {
    // 0 = most basic logging, 1 = Some more logging, 2 = Even more logging, 3 = Gib me all the LOGS!
    logLevel: 0,
    // start
    logDirectory: "logs",
  },
};
