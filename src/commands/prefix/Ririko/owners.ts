const { EmbedBuilder } = require("discord.js");
const getconfig = require("helpers/getconfig");

module.exports = {
  config: {
    name: "owners",
    description: "Replies with the registered owners only.",
    usage: "owners",
  },
  category: "Ririko",
  permissions: ["SendMessages"], // Since the "owner" is TRUE, then we can set the permissions to 'sendMessages'.
  owner: true,
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
    const ownersID = getconfig.discordBotOwners();
    if (!ownersID) return;

    const ownersARRAY = [];

    ownersID.forEach((Owner) => {
      const fetchedOWNER = message.guild.members.cache.get(Owner);
      if (!fetchedOWNER) ownersARRAY.push("*Unknown User#0000*");
      ownersARRAY.push(`${fetchedOWNER}`);
    });

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `Only owners command! \nOwners: **${ownersARRAY.join(", ")}**`
          )
          .setColor("Yellow"),
      ],
    });
  },
};
