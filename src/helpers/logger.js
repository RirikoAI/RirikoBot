const { EmbedBuilder, WebhookClient } = require("discord.js");
const pino = require("pino");
const { format } = require("date-fns");
const colors = require("colors");

let fs = require("fs");
const moment = require("moment");
let dir = "./logs";

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

const webhookLogger = process.env.ERROR_LOGS
  ? new WebhookClient({ url: process.env.ERROR_LOGS })
  : undefined;

let date = moment();
const today = new Date();
const customLogFile = fs.createWriteStream(
  `${process.cwd()}/logs/combined-${date.format("YYYY.MM.D")}.log`,
  { flags: "a" }
);

const pinoLogger = pino.default(
  {
    level: "trace",
  },
  pino.multistream([
    {
      level: "trace",
      stream: pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:yyyy-mm-d HH:MM:ss",
          ignore: "pid,hostname",
          singleLine: false,
          hideObject: true,
          customColors: "info:blue,warn:yellow,error:red",
        },
      }),
    },
    {
      level: "trace",
      stream: {
        write: (log) => {
          const { msg, pid, time, err } = JSON.parse(log);
          const cleanMsg = msg.replace(
            /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
            ""
          ); // Remove escape sequences and special characters
          const formattedLog = `[${format(
            new Date(time),
            "yyyy-MM-dd HH:mm:ss"
          )}] [PID:${pid}] ${cleanMsg}\n`; // Format the log entry with formatted timestamp, pid, and cleaned message
          customLogFile.write(formattedLog);
          if (err) {
            customLogFile.write(`${err.stack}\n`); // Log error stack trace
          }
        },
      },
    },
    // {
    //   level: "debug",
    //   stream: pino.destination({
    //     dest: `${process.cwd()}/logs/combined-${date.format("YYYY.MM.D")}.log`,
    //     sync: true,
    //   }),
    // },
  ])
);

/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
 * @param content
 * @param err
 */
function sendWebhook(content, err) {
  if (!content && !err) return;
  const errString = err?.stack || err;

  const embed = new EmbedBuilder()
    .setColor("Red")
    .setAuthor({ name: err?.name || "Error" });

  if (errString)
    embed.setDescription(
      "```js\n" +
        (errString.length > 4096
          ? `${errString.substr(0, 4000)}...`
          : errString) +
        "\n```"
    );

  embed.addFields({
    name: "Description",
    value: content || err?.message || "NA",
  });
  webhookLogger.send({ username: "Logs", embeds: [embed] }).catch((ex) => {});
}

module.exports = class Logger {
  /**
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
   * @param {string} content
   */
  static success(...content) {
    pinoLogger.info(...content);
  }

  /**
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
   * @param {string} content
   */
  static log(...content) {
    pinoLogger.info(...content);
  }

  /**
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
   * @param {string} content
   */
  static warn(...content) {
    pinoLogger.warn(...content);
  }

  /**
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
   * @param {string} content
   * @param {object} ex
   * @param args
   */
  static error(content, ex, ...args) {
    if (ex) {
      pinoLogger.error(ex, `${content}: ${ex?.message}`);
      console.oError(content, ex);
    } else {
      pinoLogger.error(content);
    }
    if (webhookLogger) sendWebhook(content, ex);
  }

  /**
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
   * @param {string} content
   */
  static debug(...content) {
    pinoLogger.debug(...content);
  }

  /**
   * @author earnestangel https://github.com/RirikoAI/RirikoBot
   */
  static overrideLoggers() {
    if (process.env.JEST_WORKER_ID) return;
    if (!console.oLog) {
      console.oLog = console.log;
    }

    if (!console.oInfo) {
      console.oInfo = console.info;
      console.info = function (...args) {
        pinoLogger.info(...args);
      };
    }

    if (!console.oError) {
      console.oError = console.error;
      console.error = async function (content, ex, ...args) {
        if (ex) {
          await pinoLogger.error(ex, `${content}: ${ex?.message}`);
          console.oError(content, ex);
        } else {
          pinoLogger.error(content);
        }
        if (webhookLogger) sendWebhook(content, ex);
      };
    }
  }
};
