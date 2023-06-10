require("dotenv").config({ path: ".env" });
let fs = require("fs");
const colors = require("colors");

// Handle errors
process.on("unhandledRejection", async (err, promise) => {
  console.error(`[ANTI-CRASH] Unhandled Rejection: ${err}`.red);
  console.error(promise);
});

process.on("uncaughtException", (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  console.error(err);
});

// will be "development" or "production" depending on your config, falls back to "development"
const NODE_ENV = process.env.NODE_ENV || "development";

// Set the build directory. If this directory is missing or empty, do `npm run build`
const buildDir = "./dist";

// This is the heart and brain of Ririko
const { createBot } = require(`./${buildDir}/ririko`);

// Create the log directory if not exists
let logDirectory = "./logs";
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

// Start the bot and web server here
(async () => {
  // Start Ririko Discord Bot
  await createBot();

  // Create the dashboard
  await require(`./${buildDir}/ririkoExpress`);
})();
