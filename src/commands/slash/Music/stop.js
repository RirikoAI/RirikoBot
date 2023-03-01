const db = require("../../../mongoDB");
const { getLang } = require("../../../utils/language");
module.exports = {
  name: "stop",
  description: "Plays the previous music again.",
  permissions: "0x0000000000000800",
  options: [],
  voiceChannel: true,
  type: 1,
  run: async (client, interaction) => {
    let lang = getLang();

    try {
      const queue = client.player.getQueue(interaction.guild.id);
      if (!queue || !queue.playing)
        return interaction
          .reply({ content: lang.msg5, ephemeral: true })
          .catch((e) => {});
      queue.stop(interaction.guild.id);
      return interaction.reply({ content: lang.msg85 }).catch((e) => {});
    } catch (e) {
      const errorNotifer = require("utils/errorNotifier");
      errorNotifer(client, interaction, e, lang);
    }
  },
};
