const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const db = require("../../../mongoDB");
const { getLang } = require("../../../utils/language");
module.exports = {
  name: "time",
  description: "Indicates which minute of the music you are playing.",
  permissions: "0x0000000000000800",
  options: [],
  type: 1,
  run: async (client, interaction) => {
    let lang = getLang();

    try {
      const queue = client.player.getQueue(interaction.guild.id);

      if (!queue || !queue.playing)
        return interaction
          .reply({ content: lang.msg5, ephemeral: true })
          .catch((e) => {});

      const saveButton = new ButtonBuilder();
      saveButton.setLabel(lang.msg86);
      saveButton.setCustomId("time");
      saveButton.setStyle(ButtonStyle.Success);
      const row = new ActionRowBuilder().addComponents(saveButton);

      let music_percent = queue.duration / 100;
      let music_percent2 = queue.currentTime / music_percent;
      let music_percent3 = Math.round(music_percent2);

      const embed = new EmbedBuilder()
        .setColor(client.config.embedColor)
        .setTitle(queue.songs[0].name)
        .setThumbnail(queue.songs[0].thumbnail)
        .setTimestamp()
        .setDescription(
          `**${queue.formattedCurrentTime} / ${queue.formattedDuration} (${music_percent3}%)**`
        )
        .setFooter({ text: lang.footer1 });
      interaction
        .reply({ embeds: [embed], components: [row] })
        .catch((e) => {});
    } catch (e) {
      const errorNotifer = require("utils/errorNotifier");
      errorNotifer(client, interaction, e, lang);
    }
  },
};
