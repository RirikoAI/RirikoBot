const { EmbedBuilder } = require("discord.js");

module.exports = {
  config: {
    name: "ping",
    description: "Replies with pong!",
    usage: "ping",
  },
  permissions: ["SendMessages"],
  owner: false,
  /**
   * Command runner
   * @author earnestangel https://github.com/RirikoAI/RirikoBot
   *
   * @param {import("discord.js").Client} client Discord.js client
   * @param {import("discord.js").Message | import("discord.js").CommandInteraction} message
   * @param args Arguments, excludes the command name (e.g: !command args[0] args[1] args[2]...)
   * @param prefix Guild specific prefix, falls back to config.js prefix
   * @param {import("config")} config Config.js file
   * @param {import("Quick.db").QuickDB} db Quick.db client
   *
   * @returns {Promise<*>}
   */
  run: async (client, message, args, prefix, config, db) => {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `🏓 **Pong!** Client websocket ping: \`${client.ws.ping}\` ms.`
          )
          .setColor("Green"),
      ],
    });
  },
};
