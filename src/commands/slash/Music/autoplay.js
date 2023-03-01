const db = require("../../../mongoDB");
const { getLang } = require("utils/language");

module.exports = {
  name: "autoplay",
  description: "Toggle the autoplay of the queue.",
  options: [],
  permissions: "0x0000000000000800",
  type: 1,
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
      const errorNotifer = require("utils/errorNotifier");
      errorNotifer(client, interaction, e, lang);
    }
  },
};
