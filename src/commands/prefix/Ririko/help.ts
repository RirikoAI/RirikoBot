const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
import { getLang } from "helpers/language";

module.exports = {
  config: {
    name: "help",
    description:
      "Replies with help menu. If you want to know the info about commands, use\ninfo [command]",
    usage: "help",
  },
  category: "Ririko",
  permissions: ["SendMessages"],
  owner: false,
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
  run: async (client, message, args, prefix, config, db) => {
    const lang = getLang();

    const categorized_commands = client.prefix_commands.reduce(
      (acc, command) => {
        const categoryIndex = acc.findIndex(
          (item) => item.name === command.category
        );
        if (categoryIndex > -1) {
          acc[categoryIndex].commands.push(command.config.name);
        } else {
          acc.push({
            name: command.category,
            commands: [command.config.name],
          });
        }
        return acc;
      },
      []
    );

    let help_message = "";

    categorized_commands.forEach(function (category) {
      const subcommands = category.commands.map((command) => {
        return `\`${prefix}${command}\``;
      });
      help_message += "**__" + category.name + "__**\n";
      help_message += subcommands.join(", ");
      help_message += "\n\n";
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
            "**Welcome to the AI-powered general Discord bot that you can call your companion. Here's all the prefix commands: ** \n\n" +
              "**__AI Chatbot__** \n `.[your prompt]` - For example: `.Hello Ririko. Please play some anime music.` " +
              "You can also ask Ririko any question like: `.What day is today?` or `.What do you think about love`, Clear your chat with `.clear`\n\n" +
              "**__Stable Diffusion__** \n Generate arts using `/imagine` command.\n\n" +
              help_message +
              `Use \`${prefix}info [command]\` for more info of the particular command. For slash commands, use \`/help\``
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
