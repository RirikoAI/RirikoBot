const { EmbedBuilder } = require("discord.js");
const config = require("config");
const db = require("../../../mongoDB");
const { getLang } = require("../../../utils/language");
module.exports = {
  name: "shuffle",
  description: "Shuffle the guild queue songs",
  options: [],
  permissions: "0x0000000000000800",
  type: 1,
  run: async (client, interaction) => {
    let lang = getLang();
    try {
      const queue = client.player.getQueue(interaction.guild.id);
      if (!queue || !queue.playing)
        return interaction
          .reply({ content: lang.msg5, ephemeral: true })
          .catch((e) => {});
      try {
        queue.shuffle(interaction);
        return interaction
          .reply({ content: `<@${interaction.user.id}>, ${lang.msg133}` })
          .catch((e) => {});
      } catch (err) {
        return interaction.reply({ content: `**${err}**` }).catch((e) => {});
      }
    } catch (e) {
      const errorNotifer = require("../functions.js");
      errorNotifer(client, interaction, e, lang);
    }
  },
};
