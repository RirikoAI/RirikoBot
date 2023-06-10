const config = require("config");
const { EmbedBuilder, WebhookClient } = require("discord.js");
const pino = require("pino");

let fs = require("fs");
let dir = "./logs";

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

const webhookLogger = process.env.ERROR_LOGS
  ? new WebhookClient({ url: process.env.ERROR_LOGS })
  : undefined;

const today = new Date();
const pinoLogger = pino.default(
  {
    level: "debug",
  },
  pino.multistream([
    {
      level: "info",
      stream: pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "yyyy-mm-dd HH:mm:ss",
          ignore: "pid,hostname",
          singleLine: false,
          hideObject: true,
          customColors: "info:blue,warn:yellow,error:red",
        },
      }),
    },
    {
      level: "debug",
      stream: pino.destination({
        dest: `${process.cwd()}/logs/combined-${today.getFullYear()}.${today.getMonth()}.${today.getDate()}.log`,
        sync: true,
      }),
    },
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
  static success(content) {
    pinoLogger.info(content);
  }

  /**
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
   * @param {string} content
   */
  static log(content) {
    pinoLogger.info(content);
  }

  /**
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
   * @param {string} content
   */
  static warn(content) {
    pinoLogger.warn(content);
  }

  /**
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
   * @param {string} content
   * @param {object} ex
   */
  static error(content, ex) {
    console.error(content, ex);
    if (ex) {
      pinoLogger.error(ex, `${content}: ${ex?.message}`);
    } else {
      pinoLogger.error(content);
    }
    if (webhookLogger) sendWebhook(content, ex);
  }

  /**
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
   * @param {string} content
   */
  static debug(content) {
    pinoLogger.debug(content);
  }
};
