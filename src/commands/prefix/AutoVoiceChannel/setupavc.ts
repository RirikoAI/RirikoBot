const { EmbedBuilder } = require("discord.js");
const fs = require("fs");

module.exports = {
  category: "AutoVoiceChannel",
  userPermissions: ["MANAGE_CHANNELS"],
  config: {
    name: "setupavc",
    description: "create a new Auto Voice Channel",
    enabled: true,
    usage: "setupavc",
    minArgsCount: 1,
  },
  /**
   * Command runner
   * @author earnestangel https://github.com/RirikoAI/RirikoBot
   *
   * @param {import("discord.js").Client} client Discord.js client
   * @param {import("discord.js").Message | import("discord.js").CommandInteraction} message
   * @param args Arguments, excludes the command name (e.g: !command args[0] args[1] args[2]...)
   * @param prefix Guild specific prefix, falls back to config.ts prefix
   * @param {import("../../../../config/config")} config config.ts file
   * @param {import("Quick.db").QuickDB} db Quick.db client
   *
   * @returns {Promise<*>}
   */
  async run(client, message, args, prefix, config, db) {
    client.avc.createPrimaryVoice(message.guild);
    await message.reply(`channel created`);
  },
};
