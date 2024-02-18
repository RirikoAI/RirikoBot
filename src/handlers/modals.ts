const fs = require("fs");
import "@ririkoai/colors.ts";

/**
 * Register all modals
 * @author TFAGaming https://github.com/TFAGaming/DiscordJS-V14-Bot-Template
 *
 * @param client
 * @param config
 * @returns {boolean}
 */
module.exports = (client, config) => {
  console.info("0------------------| Modals Handler:".blue);

  console.info("[!] Started loading modals commands...".yellow);
  const modals = fs
    .readdirSync(`./dist/modals/`)
    .filter(
      (file) =>
        (file.endsWith(".js") || file.endsWith(".ts")) &&
        !file.endsWith(".test.js")
    );

  for (let file of modals) {
    let pull = require(`../../dist/modals/${file}`);
    if (pull.id) {
      client.modals?.set(pull.id, pull);
      console.info(`[HANDLER - MODALS] Loaded a file: ${file}`.brightGreen);
    } else {
      console.info(
        `[HANDLER - MODALS] Couldn't load the file ${file}. Missing modal ID.`
          .red
      );
      continue;
    }
  }
};
