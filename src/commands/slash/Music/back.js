const db = require("../../../app/Schemas/MusicBot");
const { getLang } = require("../../../helpers/language");
module.exports = {
  name: "back",
  description: "Plays the previous track.",
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
    let lang = await db?.musicbot?.findOne({ guildID: interaction.guild.id });
    lang = getLang();
    try {
      const queue = client.player.getQueue(interaction.guild.id);
      if (!queue || !queue.playing)
        return interaction
          .reply({ content: `${lang.msg5}`, ephemeral: true })
          .catch((e) => {});
      try {
        let song = await queue.previous();
        interaction
          .reply({
            content: `${lang.msg18.replace(
              "{queue.previousTracks[1].title}",
              song.name
            )}`,
          })
          .catch((e) => {});
      } catch (e) {
        return interaction
          .reply({ content: `${lang.msg17}`, ephemeral: true })
          .catch((e) => {});
      }
    } catch (e) {
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};
