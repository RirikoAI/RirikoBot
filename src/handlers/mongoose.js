const config = require("config");
const getconfig = require("helpers/getconfig");
const mongoose = require("mongoose");
const { getLang } = require("../helpers/language");

const { log } = require("helpers/logger");

/**
 * Register mongoose handler
 *
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 * @author TFAGaming https://github.com/TFAGaming/DiscordJS-V14-Bot-Template
 *
 * @returns {boolean}
 */
module.exports = async (discordClient, from, silent = false) => {
  if (process.env.JEST_WORKER_ID) return;
  const lang = getLang();

  if (discordClient && !silent) {
    log(`[MONGODB] Connecting to MongoDB...`.yellow);
  }

  const mongoDbAccessUri =
    config.DATABASE.MongoDB.AccessURI || process.env.MONGODB_ACCESS_URI;

  if (mongoDbAccessUri) {
    await mongoose
      .connect(mongoDbAccessUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      })
      .then(async () => {})
      .catch((err) => {
        log("\nMongoDB Error: " + err + "\n\n" + lang.error4);
      });

    if (!silent)
      if (!from || discordClient) {
        log(`[MONGODB] Connected to MongoDB successfully!`.yellow);
      } else {
        log(`[MONGODB] Connected to MongoDB successfully from ${from}!`.yellow);
      }
  } else {
    log(lang.error4);
  }
};
