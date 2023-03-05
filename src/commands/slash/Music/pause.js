const db = require("../../../mongoDB");
const { getLang } = require("../../../helpers/language");
module.exports = {
  name: "pause",
  description: "Stops playing the currently playing music.",
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
          .reply({ content: lang.msg5, ephemeral: true })
          .catch((e) => {});
      const success = queue.pause();
      return interaction
        .reply({
          content: success
            ? `**${queue.songs[0].name}** - ${lang.msg48}`
            : lang.msg41,
        })
        .catch((e) => {});
    } catch (e) {
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};
