const db = require("../../../mongoDB");
const { getLang } = require("../../../helpers/language");
module.exports = {
  name: "resume",
  description: "Start paused music.",
  permissions: "0x0000000000000800",
  options: [],
  voiceChannel: true,
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
    const queue = client.player.getQueue(interaction.guild.id);
    let lang = getLang();
    try {
      if (!queue)
        return interaction
          .reply({ content: lang.msg63, ephemeral: true })
          .catch((e) => {});
      if (!queue.paused)
        return interaction
          .reply({ content: lang.msg132, ephemeral: true })
          .catch((e) => {});
      const success = queue.resume();
      return interaction
        .reply({
          content: success
            ? `**${queue.songs[0].name}**, ${lang.msg72}`
            : lang.msg71,
        })
        .catch((e) => {});
    } catch (e) {
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};
