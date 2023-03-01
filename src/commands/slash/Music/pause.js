const db = require("../../../mongoDB");
const { getLang } = require("../../../utils/language");
module.exports = {
  name: "pause",
  description: "Stops playing the currently playing music.",
  permissions: "0x0000000000000800",
  options: [],
  voiceChannel: true,
  type: 1,
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
      const errorNotifer = require("utils/errorNotifier");
      errorNotifer(client, interaction, e, lang);
    }
  },
};
