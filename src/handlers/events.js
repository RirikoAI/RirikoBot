const fs = require("fs");
const colors = require("colors");

module.exports = (client, config = []) => {
  console.log("0------------------| Events Handler:".blue);

  fs.readdirSync("./dist/events/")
    .filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"))
    .forEach((file) => {
      let pull = require(`../events/${file}`);
      if (pull.name) {
        client.events?.set(pull.name, pull);
        console.log(
          `[HANDLER - EVENTS] Loaded a file: ${pull.name}`.brightGreen
        );
      } else {
        console.log(
          `[HANDLER - EVENTS] Couldn't load the file ${file}. missing name or aliases.`
            .red
        );
      }
    });
};
