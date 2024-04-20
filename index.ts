import "@ririkoai/colors.ts";
import { backendPort, hostname, port } from "helpers/getconfig";
import { execSync } from "child_process";

require("dotenv").config({path: ".env"});
const fs = require("fs");
const {Worker} = require("worker_threads");

const NODE_ENV = process.env.NODE_ENV || "development";
const buildDir = "./src";
const logDirectory = "./logs";
const cli = require(`./${ buildDir }/ririkoCli`);

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

const {overrideLoggers} = require(`${ buildDir }/helpers/logger`);
const {twitchClientId} = require("helpers/getconfig");
overrideLoggers();

function handleUnhandledRejection(err, promise) {
  console.error(`[ANTI-CRASH] Unhandled Rejection: ${ err }`.red);
  console.error(promise);
}

function handleUncaughtException(err) {
  console.error(`Uncaught Exception: ${ err.message }`);
  console.error(err);
}

function startRirikoBotWorker() {
  require("ts-node").register();
  
  const worker_RirikoBot = new Worker(`./${ buildDir }/ririkoBot.ts`, {
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
      cli.log("Ririko Bot is now connected to Discord".brightGreen);
      cli.log(
        "\n======================= ✦ Ririko Bot ✦ =======================\n"
          .white
      );
      cli.log("[Ririko Bot] Ready to serve the world!!".magenta);
      cli.log("NODE_ENV:".red, NODE_ENV);
      cli.log(
        "\n" +
        `[READY] ${ botUsername } is up and ready to go. ${
          process.env.npm_package_version
            ? "\nRunning ririko@" + process.env.npm_package_version
            : ""
        }`.brightGreen
      );
      cli.log(
        "\n" +
        `✅  Dashboard running at http://${ hostname() }:${ port() }`.brightGreen
      );
      cli.log(
        `✅  Backend running at http://${ hostname() }:${ backendPort() }`.brightGreen
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
    `./${ buildDir }/ririkoStreamChecker`,
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
    `./${ buildDir }/ririkoQueueManager`,
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
    console.log(`Message from Ririko Queue Manager: ${ message }`);
  });
  
  worker_RirikoQueueManager.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Stream Notifier:`, error);
  });
}

function startRirikoInstallerWorker() {
  require("ts-node").register();
  
  const worker_RirikoInstaller = new Worker(`./${ buildDir }/ririkoInstaller.ts`, {
    execArgv: [
      "-r",
      "ts-node/register/transpile-only",
      "-r",
      "tsconfig-paths/register",
    ],
  });
  
  worker_RirikoInstaller.on("message", (message) => {
    if (message.ready) {
    }
  });
  
  worker_RirikoInstaller.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Express:`, error);
  });
}

function startRirikoBackendWorker() {
  require("ts-node").register();
  
  const worker_RirikoInstaller = new Worker(`./${ buildDir }/ririkoBackend.ts`, {
    execArgv: [
      "-r",
      "ts-node/register/transpile-only",
      "-r",
      "tsconfig-paths/register",
    ],
  });
  
  worker_RirikoInstaller.on("message", (message) => {
    if (message.ready) {
    }
  });
  
  worker_RirikoInstaller.on("error", (error) => {
    console.error(`[UNCAUGHT EXCEPTION] Ririko Backend:`, error);
  });
}

function startRirikoDashboard() {
  const {spawn} = require("node:child_process");
  let startArgs;
  if (process.env.NODE_ENV === "development") {
    startArgs = ["./node_modules/webpack-dev-server/bin/webpack-dev-server.js", "--port", "3000", `--mode=${ process.env.NODE_ENV }`];
  } else {
    startArgs = ["./src/ririkoDashboard.ts", "build", "--config", "../serve.json"];
  }
  
  const child = spawn("node", startArgs);
  //spawn("node", ["./src/dashboard/scripts/start.js"]);
  
  child.stdout.on("data", (data) => {
    const noIssuesMessage = data.includes("successfully") || data.includes("App listening on port");
    if (!noIssuesMessage) console.info(`${ data }`.replace(/^\s+|\s+$/g, ""));
    
    if (!initiated)
      if (noIssuesMessage) {
        initiated = true;
        
        console.info("Ririko Dashboard is now running".brightGreen);
      }
  });
  
  child.stderr.on("data", (data) => {
    console.error(`${ data }`);
  });
  
  child.on("close", (code) => {
    console.info(`child process exited with code ${ code }`);
  });
}

createLogDirectory();

process.on("unhandledRejection", handleUnhandledRejection);

process.on("uncaughtException", handleUncaughtException);

// check if config.ts file exists
if (configFileExists === true) {
  startRirikoBotWorker();
  startRirikoBackendWorker();
  startRirikoStreamCheckerWorker();
  startRirikoQueueManagerWorker();
  startRirikoDashboard();
} else {
  startRirikoInstallerWorker();
}
