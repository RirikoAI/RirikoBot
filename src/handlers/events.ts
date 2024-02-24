const fs = require("fs");
import "@ririkoai/colors.ts";

/**
 * Register all events
 * @author TFAGaming https://github.com/TFAGaming/DiscordJS-V14-Bot-Template
 *
 * @param client
 * @param config
 * @returns {boolean}
 */
module.exports = (client, config = []) => {
  console.info("0------------------| Events Handler:".blue);
  console.info("[!] Started loading events handler...".yellow);
  fs.readdirSync("./src/events/")
    .filter(
      (file) =>
        (file.endsWith(".ts") || file.endsWith(".ts")) &&
        !file.endsWith(".test.ts")
    )
    .forEach((file) => {
      let pull = require(`../../src/events/${file}`);
      if (pull.name) {
        client.events?.set(pull.name, pull);
        console.info(
          `[HANDLER - EVENTS] Loaded a file: ${pull.name}`.brightGreen
        );
      } else {
        console.info(
          `[HANDLER - EVENTS] Couldn't load the file ${file}. missing name or aliases.`
            .red
        );
      }
    });
};
