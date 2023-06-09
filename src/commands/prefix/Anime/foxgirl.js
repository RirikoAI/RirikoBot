const { MessageEmbed, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const { getLang } = require("helpers/language");

module.exports = {
  config: {
    name: "foxgirl",
    description: "Generate random foxgirl images",
    usage: "foxgirl",
  },
  owner: false,
  category: "Anime",
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
    await fetch("https://nekos.life/api/v2/img/fox_girl")
      .then((res) => res.json())
      .then((body) => {
        const embed = new EmbedBuilder()
          .setColor("Random")
          .setDescription(`Requested by: ${message.author.toString()}`)
          .setImage(body.url)
          .setTimestamp()
          .setFooter({ text: `${lang.footer1}` });

        message.channel.send({ embeds: [embed] });
      });
  },
};
