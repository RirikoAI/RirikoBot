const { EmbedBuilder } = require("discord.js");

module.exports = {
  config: {
    name: "reset",
    description: "Reset all slash commands cache of the current Guild",
    usage: "reset",
  },
  category: "Ririko",
  permissions: ["Administrator"],
  owner: true,
  /**
   * Command runner
   * @author earnestangel https://github.com/RirikoAI/RirikoBot
   *
   * @param {import("discord.js").Client} client Discord.js client
   * @param {import("discord.js").Message | import("discord.js").CommandInteraction} message
   * @param args Arguments, excludes the command name (e.g: !command args[0] args[1] args[2]...)
   * @param prefix Guild specific prefix, falls back to config.ts prefix
   * @param {import("config")} config config.ts file
   * @param {import("Quick.db").QuickDB} db Quick.db client
   *
   * @returns {Promise<*>}
   */
  run: async (client, message, args, prefix, config, db) => {
    await client.application.commands.set([]);
  },
};
