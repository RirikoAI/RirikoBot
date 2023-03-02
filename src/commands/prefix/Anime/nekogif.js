const { MessageEmbed, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const { getLang } = require("utils/language");

module.exports = {
  config: {
    name: "nekogif",
    description: "Generate random Neko gifs",
    usage: "nekogif",
  },
  owner: false,
  run: async (client, message) => {
    const lang = getLang();
    await fetch("https://nekos.life/api/v2/img/ngif")
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
