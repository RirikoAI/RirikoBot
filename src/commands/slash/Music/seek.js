const { ApplicationCommandOptionType, EmbedBuilder } = require("discord.js");
const db = require("../../../mongoDB");
const { getLang } = require("../../../helpers/language");
module.exports = {
  name: "seek",
  description: "Set the position of the track.",
  permissions: "0x0000000000000800",
  options: [
    {
      name: "position",
      description: "The position to set",
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],
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
    let lang = getLang();
    try {
      const queue = client.player.getQueue(interaction.guild.id);
      if (!queue || !queue.playing)
        return interaction
          .reply({ content: lang.msg5, ephemeral: true })
          .catch((e) => {});

      let position = getSeconds(interaction.options.getString("position"));
      if (isNaN(position))
        return interaction
          .reply({ content: `${lang.msg134}`, ephemeral: true })
          .catch((e) => {});

      queue.seek(position);
      interaction
        .reply({
          content: `${lang.msg135.replace(
            "{queue.formattedCurrentTime}",
            queue.formattedCurrentTime
          )}`,
        })
        .catch((e) => {});
    } catch (e) {
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};

function getSeconds(str) {
  var p = str.split(":");
  var s = 0;
  var m = 1;
  while (p.length > 0) {
    s += m * parseInt(p.pop(), 10);
    m *= 60;
  }
  return s;
}
