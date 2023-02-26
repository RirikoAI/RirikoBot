const buildDir = "./dist";
const NODE_ENV = process.env.NODE_ENV || "development";
const { start } = require(`./${buildDir}/ririko`);
const colors = require("colors");

(async () => {
  await start();

  // Host the bot:
  require("http")
    .createServer((req, res) => res.end("Ready."))
    .listen(3000);

  console.log("NODE_ENV:".red, NODE_ENV);
})();
