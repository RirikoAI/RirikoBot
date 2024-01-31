/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
const {
  Client,
  Partials,
  Collection,
  GatewayIntentBits,
} = require("discord.js");
const config = require("config") || null;
const colors = require("colors");

const { overrideLoggers } = require("helpers/logger");
overrideLoggers();

const { RirikoAINLP } = require("app/RirikoAI-NLP");
const getconfig = require("helpers/getconfig");
const { RirikoMusic } = require("app/RirikoMusic");
const { getLang } = require("./helpers/language");
const { RirikoAVC } = require("./app/RirikoAVC");

process.on("uncaughtException", function (err) {
  console.log("Caught exception: " + err);
});

console.info("0------------------| Ririko AI (Bot):".brightCyan);

/**
 * Ririko Bot entrypoint. Will start a new Discord client
 */
// Creating a new client:
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User,
    Partials.GuildMember,
    Partials.Reaction,
  ],
  presence: {
    activities: [
      {
        name: "I am the future 🦾",
        type: 0,
      },
    ],
    status: "online",
  },
});

// Getting the bot token:
const AuthenticationToken = getconfig.discordToken();
if (!AuthenticationToken) {
  if (!process.env.JEST_WORKER_ID) {
    console.warn(
      "[CRASH] Authentication Token for Discord bot is required! Use Environment Secrets or config.js."
        .red
    );
    process.exit();
  } else {
    console.log("Running the Ririko Bot app from Jest unit test");
  }
}

// Include config file into the client
client.language = config.LANGUAGE || "en";
client.config = config;

// Include Auto Voice Channel (AVC) functions
client.avc = new RirikoAVC();

// Include
client.partials = [Partials.User, Partials.Message, Partials.Reaction];

let lang = getLang();
const ririkoMusic = new RirikoMusic(client);
client.player = ririkoMusic.createPlayer();

// Handler:
client.prefix_commands = new Collection();
client.slash_commands = new Collection();
client.user_commands = new Collection();
client.message_commands = new Collection();
client.modals = new Collection();
client.events = new Collection();

module.exports = client;

// Register all handlers
(async () => {
  for (const file of [
    "mongoose",
    "prefix",
    "application_commands",
    "modals",
    "events",
  ]) {
    await require(`./handlers/${file}`)(client, config);
  }

  console.info("0------------------| Discord Giveaways:".blue);
  console.info(`Starting Discord Giveaways functionality`.brightGreen);
  // Initialise discord giveaways
  const { GiveawaysManager } = require("discord-giveaways");
  client.giveawaysManager = new GiveawaysManager(client, {
    storage: "giveaways.json",
    default: {
      botsCanWin: false,
      embedColor: "#2F3136",
      reaction: "🎉",
      lastChance: {
        enabled: true,
        content: `🛑 **Last chance to enter** 🛑`,
        threshold: 60000,
        embedColor: "#FF0000",
      },
    },
  });

  console.info("0------------------| Extenders:".blue);
  // Register all extenders
  for (const file of ["Guild", "Client"]) {
    await require(`./helpers/extenders/${file}`)(client, config);
  }

  // Login to the bot:
  client
    .login(AuthenticationToken)
    .catch((err) => {
      if (process.env.JEST_WORKER_ID) return;
      console.error(
        "[CRASH] Something went wrong while connecting to your bot..."
      );
      console.error("[CRASH] Error from Discord API:" + err);
      return process.exit();
    })
    .finally(async () => {
      let lines =
        "\n======================= ✦ Ririko Bot ✦ =======================\n";

      console.log("\n" + lines.white);
      // initiate instance once
      const RirikoAi = RirikoAINLP.getInstance();
      if (RirikoAi.isInitialized === true) {
        console.log("[Ririko Bot] Ready to serve the world.".magenta);
      } else {
        console.log(
          "[Ririko Bot] Something went wrong. Please check the logs.".red
        );
      }

      process
        .on("unhandledRejection", (reason, p) => {
          console.error(reason, "Unhandled Rejection at Promise", p);
        })
        .on("uncaughtException", (err) => {
          console.error(err, "Uncaught Exception thrown");
          process.exit(1);
        });

      // Use this to remove commands list
      // client.application.commands.set([], "755618872920637440");
    });
})();
