const config = require("config");
const getconfig = require("helpers/getconfig");
const mongoose = require("mongoose");
const { getLang } = require("../helpers/language");

/**
 * Register mongoose handler
 *
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 * @author TFAGaming https://github.com/TFAGaming/DiscordJS-V14-Bot-Template
 *
 * @param client
 * @returns {boolean}
 */
module.exports = async (client) => {
  const lang = getLang();
  console.log("[MONGODB] Connecting to MongoDB...".yellow);
  const mongoDbAccessUri =
    config.DATABASE.MongoDB.AccessURI || process.env.MONGODB_ACCESS_URI;

  if (mongoDbAccessUri) {
    const mongoose = require("mongoose");
    await mongoose
      .connect(mongoDbAccessUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      })
      .then(async () => {})
      .catch((err) => {
        console.log("\nMongoDB Error: " + err + "\n\n" + lang.error4);
      });

    if (!process.env.JEST_WORKER_ID) {
      console.log(`Connected to MongoDB successfully!`.yellow);
    }
  } else {
    console.log(lang.error4);
  }
};
