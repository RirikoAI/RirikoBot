require("dotenv").config({ path: ".env" });
const buildDir = "./dist";
const NODE_ENV = process.env.NODE_ENV || "development";
const port = process.env.PORT || 3000;
const { start } = require(`./${buildDir}/ririko`);
const colors = require("colors");

(async () => {
  await start();

  // Host the bot:
  require("http")
    .createServer((req, res) => res.end("Ready."))
    .listen(port);

  console.log("NODE_ENV:".red, NODE_ENV);
})();
