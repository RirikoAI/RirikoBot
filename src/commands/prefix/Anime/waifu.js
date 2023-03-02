const { MessageEmbed, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const { getLang } = require("utils/language");

module.exports = {
  config: {
    name: "waifu",
    description: "Generate random waifu images",
    usage: "waifu",
  },
  owner: false,
  run: async (client, message) => {
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
