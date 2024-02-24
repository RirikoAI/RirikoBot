import "@ririkoai/colors.ts";

require("dotenv").config({ path: ".env" });
const fs = require("fs");
const { Worker } = require("worker_threads");

const NODE_ENV = process.env.NODE_ENV || "development";
const buildDir = "./src";
const logDirectory = "./logs";
const cli = require(`./${buildDir}/ririkoCli`);

const configFileExists = fs.existsSync("./config.ts");

let initiated = false;
let botUsername = "";

process
  .on("unhandledRejection", (reason, p) => {
    console.error(reason, "Unhandled Rejection at Promise", p);
  })
  .on("uncaughtException", (err) => {
    console.error(err, "Uncaught Exception thrown");
    // @ts-ignore
    console.oLog(err);
  });

function createLogDirectory() {
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
  }
}

const { overrideLoggers } = require(`${buildDir}/helpers/logger`);
const { twitchClientId } = require("helpers/getconfig");
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
  require("ts-node").register();

  const worker_RirikoBot = new Worker(`./${buildDir}/ririkoBot.ts`, {
    execArgv: [
      "-r",
      "ts-node/register/transpile-only",
      "-r",
      "tsconfig-paths/register",
    ],
  });

  worker_RirikoBot.on("message", (message) => {
    if (message.ready) {
      botUsername = message.botUsername;
      console.info("Ririko Bot is now connected to Discord".brightGreen);
    }
  });

  worker_RirikoBot.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Bot:`, error);
  });
}

function startRirikoStreamCheckerWorker() {
  require("ts-node").register();

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
    `./${buildDir}/ririkoStreamChecker`,
    {
      execArgv: [
        "-r",
        "ts-node/register/transpile-only",
        "-r",
        "tsconfig-paths/register",
      ],
    }
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
  require("ts-node").register();

  const worker_RirikoQueueManager = new Worker(
    `./${buildDir}/ririkoQueueManager`,
    {
      execArgv: [
        "-r",
        "ts-node/register/transpile-only",
        "-r",
        "tsconfig-paths/register",
      ],
    }
  );

  worker_RirikoQueueManager.on("message", (message) => {
    console.log(`Message from Ririko Queue Manager: ${message}`);
  });

  worker_RirikoQueueManager.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Stream Notifier:`, error);
  });
}

function startRirikoExpressWorker() {
  require("ts-node").register();

  const worker_RirikoExpress = new Worker(`./${buildDir}/ririkoExpress.ts`, {
    execArgv: [
      "-r",
      "ts-node/register/transpile-only",
      "-r",
      "tsconfig-paths/register",
    ],
  });

  worker_RirikoExpress.on("message", (message) => {
    if (message.ready) {
    }
  });

  worker_RirikoExpress.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Express:`, error);
  });
}

function startRirikoDashboard() {
  const { spawn } = require("node:child_process");
  const child = spawn("node", ["./src/dashboard/scripts/start.js"]);

  child.stdout.on("data", (data) => {
    const noIssuesMessage = data.includes("No issues found");
    if (!noIssuesMessage) console.info(`${data}`.replace(/^\s+|\s+$/g, ""));

    if (!initiated)
      if (noIssuesMessage) {
        initiated = true;

        cli.log(
          "\n======================= ✦ Ririko Bot ✦ =======================\n"
            .white
        );
        cli.log("[Ririko Bot] Ready to serve the world!!".magenta);
        cli.log("NODE_ENV:".red, NODE_ENV);
        cli.log(
          "\n" +
            `[READY] ${botUsername} is up and ready to go. ${
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

  child.stderr.on("data", (data) => {
    console.error(`${data}`);
  });

  child.on("close", (code) => {
    console.info(`child process exited with code ${code}`);
  });
}

createLogDirectory();

process.on("unhandledRejection", handleUnhandledRejection);

process.on("uncaughtException", handleUncaughtException);

startRirikoExpressWorker();

// check if config.ts file exists
if (configFileExists === true) {
  startRirikoBotWorker();
  startRirikoStreamCheckerWorker();
  startRirikoQueueManagerWorker();
  startRirikoDashboard();
}
