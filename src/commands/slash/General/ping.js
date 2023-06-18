const { EmbedBuilder } = require("discord.js");
const db = require("../../../app/Schemas/MusicBot");
const { getLang } = require("../../../helpers/language");
module.exports = {
  name: "ping",
  description: "It helps you to get information about the speed of the bot.",
  permissions: "0x0000000000000800",
  options: [],
  type: 1,
  run: async (client, interaction) => {
    let lang = getLang();

    try {
      const start = Date.now();
      interaction
        .reply("Pong!")
        .then((msg) => {
          const end = Date.now();
          const embed = new EmbedBuilder()
            .setColor(client.config.embedColor)
            .setTitle(client.user.username + " - Pong!")
            .setThumbnail(client.user.displayAvatarURL())
            .addFields([
              { name: lang.msg49, value: `\`${end - start}ms\` 🛰️` },
              { name: lang.msg50, value: `\`${Date.now() - start}ms\` 🛰️` },
              {
                name: lang.msg51,
                value: `\`${Math.round(client.ws.ping)}ms\` 🛰️`,
              },
            ])
            .setTimestamp()
            .setFooter({ text: lang.footer1 });
          return interaction.editReply({ embeds: [embed] }).catch((e) => {});
        })
        .catch((err) => {});
    } catch (e) {
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};
