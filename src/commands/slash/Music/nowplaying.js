const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const db = require("../../../mongoDB");
const { getLang } = require("../../../utils/language");
module.exports = {
  name: "nowplaying",
  description: "Provides information about the music being played.",
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

      const track = queue.songs[0];
      if (!track)
        return interaction
          .reply({ content: lang.msg5, ephemeral: true })
          .catch((e) => {});

      const embed = new EmbedBuilder();
      embed.setColor(client.config.embedColor);
      embed.setThumbnail(track.thumbnail);
      embed.setTitle(track.name);
      embed.setDescription(`> Audio \`%${queue.volume}\`
> Duration \`${track.formattedDuration}\`
> URL: **${track.url}**
> Loop Mode \`${
        queue.repeatMode
          ? queue.repeatMode === 2
            ? "All Queue"
            : "This Song"
          : "Off"
      }\`
> Filter: \`${queue.filters.names.join(", ") || "Off"}\`
> By: <@${track.user.id}>`);

      embed.setTimestamp();
      embed.setFooter({ text: lang.footer1 });

      const saveButton = new ButtonBuilder();
      saveButton.setLabel(lang.msg47);
      saveButton.setCustomId("saveTrack");
      saveButton.setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(saveButton);

      interaction
        .reply({ embeds: [embed], components: [row] })
        .catch((e) => {});
    } catch (e) {
      const errorNotifer = require("utils/errorNotifier");
      errorNotifer(client, interaction, e, lang);
    }
  },
};
