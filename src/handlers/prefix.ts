const fs = require("fs");
import "@ririkoai/colors.ts";

/**
 * Register all prefix commands
 * @author TFAGaming https://github.com/TFAGaming/DiscordJS-V14-Bot-Template
 *
 * @param client
 * @param config
 * @returns {boolean}
 */
module.exports = (client, config) => {
  console.info("0------------------| Prefix Handler:".blue);
  console.info("[!] Started loading prefix commands...".yellow);

  fs.readdirSync("./dist/commands/prefix/").forEach((dir) => {
    const commands = fs
      .readdirSync(`./dist/commands/prefix/${dir}`)
      .filter(
        (file) =>
          (file.endsWith(".js") || file.endsWith(".ts")) &&
          !file.endsWith(".test.js")
      );

    for (let file of commands) {
      let pull = require(`../../dist/commands/prefix/${dir}/${file}`);
      if (pull.config?.name) {
        client.prefix_commands?.set(pull.config.name, pull);
        console.info(
          `[HANDLER - PREFIX] Loaded a file: ${pull.config.name} (#${client.prefix_commands?.size})`
            .brightGreen
        );
      } else {
        console.info(
          `[HANDLER - PREFIX] Couldn't load the file ${file}, missing module name value.`
            .red
        );
        continue;
      }
    }
  });
};
