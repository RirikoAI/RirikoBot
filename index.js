require("dotenv").config({ path: ".env" });
const fs = require("fs");
const colors = require("colors");
const { Worker } = require("worker_threads");

const NODE_ENV = process.env.NODE_ENV || "development";
const buildDir = "./dist";
const logDirectory = "./logs";
const cli = require(`./${buildDir}/ririkoCli`);

const configFileExists = fs.existsSync("./config.js");

function createLogDirectory() {
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
  }
}

const { overrideLoggers } = require(`${buildDir}/helpers/logger`);
const { twitchClientId } = require("./src/helpers/getconfig");
overrideLoggers();

function handleUnhandledRejection(err, promise) {
  console.error(`[ANTI-CRASH] Unhandled Rejection: ${err}`.red);
  console.error(promise);
}

function handleUncaughtException(err) {
  console.error(`Uncaught Exception: ${err.message}`);
  console.error(err);
}

function startRirikoBotWorker() {
  const worker_RirikoBot = new Worker(`./${buildDir}/ririkoBot`);

  worker_RirikoBot.on("message", (message) => {
    if (message.ready) {
      cli.log("NODE_ENV:".red, NODE_ENV);
      cli.log(
        "\n" +
          `[READY] ${message.botUsername} is up and ready to go. ${
            process.env.npm_package_version
              ? "\nRunning ririko@" + process.env.npm_package_version
              : ""
          }`.brightGreen
      );
      cli.log(
        "\n==============================================================\n"
          .white
      );
      cli.enablePrompt();
    }
  });

  worker_RirikoBot.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Bot:`, error);
  });
}

function startRirikoStreamCheckerWorker() {
  if (twitchClientId()) {
    console.log(
      "Twitch Client ID found in environment variables. Starting stream checker."
    );
  } else {
    console.log(
      "Twitch Client ID not found in environment variables. Not starting stream checker."
    );
    return;
  }

  const worker_ririkoStreamChecker = new Worker(
    `./${buildDir}/ririkoStreamChecker`
  );

  worker_ririkoStreamChecker.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Stream Notifier:`, error);
  });

  worker_ririkoStreamChecker.on("message", (message) => {
    if (message.exit) {
      worker_ririkoStreamChecker.terminate().then(() => {
        console.error("Terminating stream checker due to unrecoverable error");
      });
    }
  });
}

function startRirikoQueueManagerWorker() {
  const worker_RirikoQueueManager = new Worker(
    `./${buildDir}/ririkoQueueManager`
  );

  worker_RirikoQueueManager.on("message", (message) => {
    console.log(`Message from Ririko Queue Manager: ${message}`);
  });

  worker_RirikoQueueManager.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Stream Notifier:`, error);
  });
}

function startRirikoExpressWorker() {
  const worker_RirikoExpress = new Worker(`./${buildDir}/ririkoExpress.js`);

  worker_RirikoExpress.on("message", (message) => {
    if (message.ready) {
    }
  });

  worker_RirikoExpress.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Express:`, error);
  });
}

(function () {
  createLogDirectory();

  process.on("unhandledRejection", handleUnhandledRejection);

  process.on("uncaughtException", handleUncaughtException);

  startRirikoExpressWorker();

  // check if config.js file exists
  if (configFileExists === true) {
    startRirikoBotWorker();
    startRirikoStreamCheckerWorker();
    startRirikoQueueManagerWorker();
  }
})();
