const db = require("../../../app/Schemas/MusicBot");
const { getLang } = require("../../../helpers/language");
module.exports = {
  name: "clear",
  description: "Clears the music queue.",
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
      if (!queue || !queue.playing)
        return interaction
          .reply({ content: `${lang.msg5}`, ephemeral: true })
          .catch((e) => {});
      if (!queue.songs[0])
        return interaction
          .reply({ content: `${lang.msg23}`, ephemeral: true })
          .catch((e) => {});
      await queue.stop(interaction.guild.id);
      interaction.reply({ content: `${lang.msg24}` }).catch((e) => {});
    } catch (e) {
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};
