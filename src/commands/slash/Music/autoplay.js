const db = require("../../../app/Schemas/MusicBot");
const { getLang } = require("helpers/language");

module.exports = {
  name: "autoplay",
  description: "Toggle the autoplay of the queue.",
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
      const queue = client?.player?.getQueue(interaction?.guild?.id);
      if (!queue || !queue?.playing)
        return interaction
          ?.reply({ content: lang.msg5, ephemeral: true })
          .catch((e) => {});
      queue?.toggleAutoplay();
      interaction?.reply(queue?.autoplay ? lang.msg136 : lang.msg137);
    } catch (e) {
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};
