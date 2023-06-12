require("dotenv").config({ path: ".env" });
let fs = require("fs");
const colors = require("colors");
const { Worker } = require("worker_threads");

// will be "development" or "production" depending on your config, falls back to "development"
const NODE_ENV = process.env.NODE_ENV || "development";

// Set the build directory. If this directory is missing or empty, do `npm run build`
const buildDir = "./dist";

// Create the log directory if not exists
let logDirectory = "./logs";
if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

const { overrideLoggers } = require(`${buildDir}/helpers/logger`);
overrideLoggers();

// Handle errors
process.on("unhandledRejection", async (err, promise) => {
  console.error(`[ANTI-CRASH] Unhandled Rejection: ${err}`.red);
  console.error(promise);
});

process.on("uncaughtException", (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  console.error(err);
});

// Start the bot and web server here
(async () => {
  const cli = require(`./${buildDir}/ririkoCli`);

  const { Worker } = require("worker_threads");

  // Function 1
  function function1() {
    console.log("Function 1 is running");
    // Add your function logic here
  }

  // Function 2
  function function2() {
    console.log("Function 2 is running");
    // Add your function logic here
  }

  // Create a worker thread for Function 1
  const worker_RirikoStreamChecker = new Worker(
    `./${buildDir}/ririkoStreamChecker`
  );

  // Create a worker thread for Function 1
  const worker_RirikoExpress = new Worker(`./${buildDir}/ririkoExpress`);

  // Create a worker thread for Function 2
  const worker_RirikoBot = new Worker(`./${buildDir}/ririkoBot`);

  // Listen for messages from worker threads
  worker_RirikoExpress.on("message", (message) => {
    console.log(`Message from Function 1: ${message}`);
  });

  worker_RirikoBot.on("message", (message) => {
    if (message.ready) {
      cli.log("NODE_ENV:".red, NODE_ENV);
      cli.log(
        "\n" +
          `[READY] ${message.botUsername} is up and ready to go.`.brightGreen
      );
      cli.log(
        "\n==============================================================\n"
          .white
      );
      cli.enablePrompt();
    }
  });

  // Listen for errors from worker threads
  worker_RirikoExpress.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Express:`, error);
  });

  worker_RirikoBot.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Bot:`, error);
  });

  worker_RirikoStreamChecker.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Stream Notifier:`, error);
  });

  // Start the worker threads
  worker_RirikoExpress.postMessage("Start");
  worker_RirikoStreamChecker.postMessage("Start");
  worker_RirikoBot.postMessage("Start");
})();
