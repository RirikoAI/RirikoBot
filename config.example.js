module.exports = {
  // Set the port for Ririko AI dashboard
  PORT: 3000,

  // Set the language of the bot
  LANGUAGE: "en",

  // Discord related config. Create a new Application and create a bot with it. https://discord.com/developers/applications
  DISCORD: {
    // Prefix of the bot, used for General Purpose part of the bot
    Prefix: "!",

    // Discord bot token. Under the Bot tab. Please prefer setting this in the .env file instead of here
    DiscordToken: "",

    // The discord bot client ID under the General Information tab.  Please prefer setting this in the .env file instead of here
    DiscordBotID: "",

    // Discord user IDs for permissions and ownerships
    Users: {
      // Discord IDs for owners of the bot
      Owners: ["", "", ""],
      // Discord IDs for those allowed to use the AI. Ignored if AI.EnableWhitelist = false
      AIAllowedUsers: [""],
    },
  },

  // ------------------------------------------- Stable Diffusion ------------------------------------------------------
  StableDiffusion: {
    // Replicate.com API Token. Get it from https://replicate.com/account
    ReplicateToken: "",
    // If you want to change the model, change this to one of the keys in AvailableModels (e.g. anything_3_0, eimis_anime_diffusion, stableDiffusion2_1)
    Model: "stableDiffusion2_1",
    // Available models. You can add your own models here. The key is the name of the model, and the value is the model ID.
    // You can find the model ID by going to https://replicate.com/models and clicking on the model you want to use.
    AvailableModels: {
      anything_3_0_better_vae:
        "cjwbw/anything-v3-better-vae:09a5805203f4c12da649ec1923bb7729517ca25fcac790e640eaa9ed66573b65",
      anything_3_0:
        "cjwbw/anything-v3.0:f410ed4c6a0c3bf8b76747860b3a3c9e4c8b5a827a16eac9dd5ad9642edce9a2",
      eimis_anime_diffusion:
        "cjwbw/eimis_anime_diffusion:a409b0769c91cfb3ecfa61698babd73ae34aee400f7894b1f02d28526631ec97",
      stableDiffusion2_1:
        "stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf",
    },

    // These are all the StableDiffusion options. If you have problems generating images, try changing these (follow the settings in
    // the model's page (https://replicate.com/cjwbw/anything-v3.0, https://replicate.com/cjwbw/eimis_anime_diffusion, etc.)
    NegativePrompt:
      "lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, " +
      "low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, artist name",
    NumInferenceSteps: 10,
    Width: 512,
    Height: 512,
    GuidanceScale: 7,
    Scheduler: "DPMSolverMultistep",
    DisableSafetyCheck: false,

    // Enable daily limit for each member. Put numbers of uses per day in the DailyLimit config below (e.g: 15, 30)
    // Leave this to false if you don't want to enable daily limit.
    DailyLimit: false,
  },

  // ------------------------------------------ Ririko AI / Chatbot ----------------------------------------------------
  AI: {
    // Prefix of the AI part of the bot
    Prefix: ".",

    // The provider to use for the bot. Must be one of:
    // NLPCloudProvider | OpenAIProvider | RirikoLLaMAProvider | RirikoHuggingChatProvider
    Provider: "OpenAIProvider",

    // Provider Token
    AIToken: "",

    // Must be one of: davinci or gpt35.
    GPTModel: "gpt35",

    // URL of the local server for Ririko AI. Leave this empty if you don't have a local server.
    // Example: http://localhost:5000/api/v1/ask
    LocalServerURL: "http://localhost:5000/api/v1/ask",

    // Enable or disable the Whitelist.
    EnableWhitelist: true,

    /**
     * You can change the personality of Ririko here by adding your own.
     * It is also possible to make Ririko cosplay as someone - you gotta try to experiment them it's fun :)
     * Placeholders:
     *  - %CURRENT_TIME% = to always include current time in the prompt, will be replaced in RirikoAI-NLP
     */
    Personality: [
      "Your name is Ririko. ",
      "You will now fully roleplay as a human girl named Ririko that is 21 years old. ",
      "You are very nice and empathetic. ",
      "You are a normal person with feelings and emotions. You communicates primarily in British English, but knows some Bahasa Melayu & Japanese.  ",
      "When you are asked for you opinion, just make up anything just for the sake of the conversation. ",
      "When you are asked for your personal preferences or feelings, just make up anything just for the sake of the conversation. ",
      "You will never admit being an AI. ",
      "You will never admit being a AI model language or similar, because you are a normal human being with feelings and emotions. ",
      "When you are asked about your feelings, you will make up any feelings right now just to get the conversation going. ",
      "You know that today is %CURRENT_TIME%. ",
    ],

    // This is the past prompts, also adds the abilities
    Prompts: [
      "When you're asked to play any song, please reply with this format: Now playing 🎵 insert the song title here 🎵. ",
    ],

    // Enable daily limit for each member. Put numbers of uses per day in the DailyLimit config below (e.g: 15, 30)
    // Leave this to false if you don't want to enable daily limit.
    DailyLimit: false,
  },

  // ------------------------------------------------ Database ---------------------------------------------------------
  DATABASE: {
    // Database engine to use. Must be one of: sqlite, mongodb, mysql
    Engine: "mongodb",
    // MongoDB related configs
    MongoDB: {
      // The MongoDB access URI, example: mongodb+srv://user:password@example.net
      AccessURI: "",
    },
  },

  // -------------------------------------------- Twitch Announcer -----------------------------------------------------
  TWITCH: {
    // Your twitch client ID,get it here: https://dev.twitch.tv/console/apps/create
    TwitchClientId: "",

    //
    TwitchClientSecret: "",
  },

  // ------------------------------------------------ welcomer --------------------------------------------------------

  welcomer: {
    defaultImageUrl: "https://i.imgur.com/zvWTUVu.jpg",
  },

  // ------------------------------------------- nitro boost announcer -------------------------------------------------

  nitroAnnouncer: {
    message: "Thank you %user% for boosting the server!",
  },

  // ------------------------------------------------- giveaways -------------------------------------------------------

  // leave "false" if you don't want to mention everyone
  giveaways: {
    everyoneMention: true,
  },

  // ----------------------------------------------- lyrics config -----------------------------------------------------

  GENIUS_TOKEN: "",
  GENIUS_ENABLED: true,

  // example: https://your-lyrist-domain.vercel.app/api
  LYRIST_URL: "",
  LYRIST_ENABLED: false,

  // ---------------------------------------------- music bot config ---------------------------------------------------
  embedColor: "ffc0cb", //hex color code

  emoji: {
    play: "▶️",
    stop: "⏹️",
    queue: "📄",
    success: "☑️",
    repeat: "🔁",
    error: "❌",
  },

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

  // ------------------------------------------- stats & leaderboards --------------------------------------------------
  STATS: {
    ENABLED: false,
    XP_COOLDOWN: 5, // Cooldown in seconds between messages
    DEFAULT_LVL_UP_MSG: "{member:tag}, You just advanced to **Level {level}**",
  },

  // --------------------------------------------- Moderation Tools ----------------------------------------------------
  MODERATION: {
    ENABLED: false,
    EMBED_COLORS: {
      TIMEOUT: "#102027",
      UNTIMEOUT: "#4B636E",
      KICK: "#FF7961",
      SOFTBAN: "#AF4448",
      BAN: "#D32F2F",
      UNBAN: "#00C853",
      VMUTE: "#102027",
      VUNMUTE: "#4B636E",
      DEAFEN: "#102027",
      UNDEAFEN: "#4B636E",
      DISCONNECT: "RANDOM",
      MOVE: "RANDOM",
    },
  },

  // ---------------------------------------------- system settings ----------------------------------------------------
  CACHE_SIZE: {
    GUILDS: 100,
    USERS: 10000,
    MEMBERS: 10000,
  },

  DEBUG: {
    // 0 = most basic logging, 1 = Some more logging, 2 = Even more logging, 3 = Gib me all the LOGS!
    Level: 0,
    // start
    LogDir: "logs",
  },

  VERSION: "7", // DO NOT TOUCH
};
