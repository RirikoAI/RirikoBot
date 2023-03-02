const { MessageEmbed, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const { getLang } = require("utils/language");

module.exports = {
  config: {
    name: "wink",
    description: "Generate random winking anime images",
    usage: "wink",
  },
  owner: false,
  run: async (client, message) => {
    const lang = getLang();
    await fetch("https://some-random-api.ml/animu/wink")
      .then((res) => res.json())
      .then((body) => {
        const embed = new EmbedBuilder()
          .setColor("Random")
          .setDescription(`Requested by: ${message.author.toString()}`)
          .setImage(body.link)
          .setTimestamp()
          .setFooter({ text: `${lang.footer1}` });

        message.channel.send({ embeds: [embed] });
      });
  },
};
