const { MessageEmbed, EmbedBuilder } = require("discord.js");
const { getLang } = require("helpers/language");

module.exports = {
  config: {
    name: "waifu",
    description: "Generate random waifu images",
    usage: "waifu",
  },
  category: "Anime",
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
    await fetch("https://nekos.life/api/v2/img/waifu")
      .then((res) => res.json())
      .then((body) => {
        const embed = new EmbedBuilder()
          .setColor("Random")
          .setTitle("Here's your Waifu")
          .setDescription(`${message.author.toString()}`)
          .setImage(body.url)
          .setTimestamp()
          .setFooter({ text: `${lang.footer1}` });

        message.channel.send({ embeds: [embed] });
      });
  },
};
