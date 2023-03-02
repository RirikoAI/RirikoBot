const { MessageEmbed, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const { getLang } = require("utils/language");

module.exports = {
  config: {
    name: "spoiler",
    description: "Wrap your texts with spoiler just to annoy your friends",
    usage: "spoiler [text]",
  },
  owner: false,
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
