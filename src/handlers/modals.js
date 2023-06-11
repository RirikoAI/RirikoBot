const fs = require("fs");
const colors = require("colors");

/**
 * Register all modals
 * @author TFAGaming https://github.com/TFAGaming/DiscordJS-V14-Bot-Template
 *
 * @param client
 * @param config
 * @returns {boolean}
 */
module.exports = (client, config) => {
  console.log("0------------------| Modals Handler:".blue);

  console.log("[!] Started loading modals commands...".yellow);
  const modals = fs
    .readdirSync(`./dist/modals/`)
    .filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"));

  for (let file of modals) {
    let pull = require(`../modals/${file}`);
    if (pull.id) {
      client.modals?.set(pull.id, pull);
      console.log(`[HANDLER - MODALS] Loaded a file: ${file}`.brightGreen);
    } else {
      console.log(
        `[HANDLER - MODALS] Couldn't load the file ${file}. Missing modal ID.`
          .red
      );
      continue;
    }
  }
};
