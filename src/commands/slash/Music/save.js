const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require("discord.js");
const db = require("../../../mongoDB");
const { getLang } = require("../../../helpers/language");
module.exports = {
  name: "save",
  description: "It sends and saves the played music to you via dm box.",
  permissions: "0x0000000000000800",
  options: [],
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

      const Modal = new ModalBuilder()
        .setCustomId("playlistModal")
        .setTitle(lang.msg6);

      const PlayList = new TextInputBuilder()
        .setCustomId("playlist")
        .setLabel(lang.msg7)
        .setRequired(true)
        .setStyle(TextInputStyle.Short);

      const PlaylistRow = new ActionRowBuilder().addComponents(PlayList);
      Modal.addComponents(PlaylistRow);
      await interaction.showModal(Modal).catch((e) => {});
    } catch (e) {
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};
