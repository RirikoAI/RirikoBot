const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const { getLang } = require("../../../utils/language");

module.exports = {
  config: {
    name: "help",
    description:
      "Replies with help menu. If you want to know the info about commands, use\ninfo [command]",
    usage: "help",
  },
  permissions: ["SendMessages"],
  owner: false,
  run: async (client, message, args, prefix) => {
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
          .setFooter({
            text: `${lang.footer1}`,
          })
          .setColor("Blue"),
      ],
    });
  },
};
