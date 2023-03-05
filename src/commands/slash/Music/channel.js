const { ApplicationCommandOptionType } = require("discord.js");
const db = require("../../../mongoDB");
const { getLang } = require("../../../helpers/language");
module.exports = {
  name: "channel",
  description:
    "It allows you to set the channel or channels where the bot can be used.",
  permissions: "0x0000000000000020",
  type: 1,
  options: [
    {
      name: "add",
      description: "Add a command usage channel.",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "channel",
          description: "Mention a text channel.",
          type: ApplicationCommandOptionType.Channel,
          required: true,
        },
      ],
    },
    {
      name: "remove",
      description: "Remove a command usage channel.",
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: "channel",
          description: "Mention a text channel.",
          type: ApplicationCommandOptionType.Channel,
          required: true,
        },
      ],
    },
  ],
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
      const { ChannelType, EmbedBuilder } = require("discord.js");
      let stp = interaction.options.getSubcommand();
      if (stp === "add") {
        const channel = interaction.options.getChannel("channel");
        if (!channel) return interaction.reply(lang.msg120).catch((e) => {});

        if (channel.type !== ChannelType.GuildText)
          return interaction
            .reply({ content: `${lang.msg125}`, ephemeral: true })
            .catch((e) => {});

        const data = await db?.musicbot?.findOne({
          guildID: interaction.guild.id,
        });

        const channel_filter = data?.channels?.filter(
          (x) => x.channel === channel.id
        );
        if (channel_filter?.length > 0)
          return interaction
            .reply({ content: lang.msg124, ephemeral: true })
            .catch((e) => {});

        await db.musicbot
          .updateOne(
            { guildID: interaction.guild.id },
            {
              $push: {
                channels: {
                  channel: channel.id,
                },
              },
            },
            { upsert: true }
          )
          .catch((e) => {});

        return await interaction
          .reply({
            content: lang.msg121.replace("{channel}", channel.id),
            ephemeral: true,
          })
          .catch((e) => {});
      }
      if (stp === "remove") {
        const channel = interaction.options.getChannel("channel");
        if (!channel) return interaction.reply(lang.msg120).catch((e) => {});

        const data = await db?.musicbot?.findOne({
          guildID: interaction.guild.id,
        });
        if (!data)
          return interaction
            .reply({ content: lang.msg122, ephemeral: true })
            .catch((e) => {});

        const channel_filter = data?.channels?.filter(
          (x) => x.channel === channel.id
        );
        if (!channel_filter?.length > 0)
          return interaction
            .reply({ content: lang.msg122, ephemeral: true })
            .catch((e) => {});

        await db.musicbot
          .updateOne(
            { guildID: interaction.guild.id },
            {
              $pull: {
                channels: {
                  channel: channel.id,
                },
              },
            },
            { upsert: true }
          )
          .catch((e) => {});

        return await interaction
          .reply({
            content: lang.msg123.replace("{channel}", channel.id),
            ephemeral: true,
          })
          .catch((e) => {});
      }
    } catch (e) {
      const errorNotifier = require("helpers/errorNotifier");
      errorNotifier(client, interaction, e, lang);
    }
  },
};
