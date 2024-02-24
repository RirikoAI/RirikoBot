const { MessageEmbed, EmbedBuilder } = require("discord.js");
const { getLang } = require("helpers/language");

module.exports = {
  config: {
    name: "spoiler",
    description: "Wrap your texts with spoiler just to annoy your friends",
    usage: "spoiler [text]",
  },
  category: "Fun",
  owner: false,
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
    if (!args[0])
      return message.reply(
        `Please write something. See **${prefix}info spoiler**`
      );

    const lang = getLang();

    const string = args.join(" ");

    await fetch("https://nekos.life/api/v2/spoiler?text=" + string)
      .then((res) => res.json())
      .then((body) => {
        const embed = new EmbedBuilder()
          .setColor("Random")
          .setTitle("Here is it:")
          .setDescription(`\`\`\`${body.owo}\`\`\``)
          .setTimestamp()
          .setFooter({ text: `${lang.footer1}` });

        message.channel.send({ embeds: [embed] });
      });
  },
};
