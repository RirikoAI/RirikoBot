const { EmbedBuilder } = require("discord.js");
const config = require("config");
const db = require("../../../mongoDB");
const { getLang } = require("../../../helpers/language");
module.exports = {
  name: "shuffle",
  description: "Shuffle the guild queue songs",
  options: [],
  permissions: "0x0000000000000800",
  type: 1,
  /**
   * Command runner
   * @author umutxyp https://github.com/umutxyp/MusicBot
   *
   * @param {import("discord.js").Client} client Discord.js client
   * @param {import("discord.js").Interaction} interaction
   *
   * @returns {Promise<*>}
   */
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
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};
