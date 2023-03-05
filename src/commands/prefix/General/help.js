const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const { getLang } = require("../../../helpers/language");

module.exports = {
  config: {
    name: "help",
    description:
      "Replies with help menu. If you want to know the info about commands, use\ninfo [command]",
    usage: "help",
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
    const lang = getLang();
    const commands = client.prefix_commands.map((command) => {
      return `${prefix}${command.config.name}`;
    });

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setAuthor({
            name: client.user.tag,
            iconURL: client.user.displayAvatarURL({
              dynamic: true,
            }),
          })
          .setThumbnail(client.user.displayAvatarURL())
          .setTimestamp()
          .setDescription(
            "**Available prefix commands for this bot:** \n\n" +
              commands.join(", ") +
              `\n\nUse **${prefix}info** for  info of the above commands.`
          )
          .addFields(lang.field1)
          .setFooter({
            text: `${lang.footer1}`,
          })
          .setColor("Blue"),
      ],
    });
  },
};
