const fs = require("fs");
const colors = require("colors");

module.exports = (client, config) => {
  console.log("0------------------| Prefix Handler:".blue);

  fs.readdirSync("./dist/commands/prefix/").forEach((dir) => {
    const commands = fs
      .readdirSync(`./dist/commands/prefix/${dir}`)
      .filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"));

    for (let file of commands) {
      let pull = require(`../commands/prefix/${dir}/${file}`);
      if (pull.config.name) {
        client.prefix_commands?.set(pull.config.name, pull);
        console.log(
          `[HANDLER - PREFIX] Loaded a file: ${pull.config.name} (#${client.prefix_commands?.size})`
            .brightGreen
        );
      } else {
        console.log(
          `[HANDLER - PREFIX] Couldn't load the file ${file}, missing module name value.`
            .red
        );
        continue;
      }
    }
  });
};
