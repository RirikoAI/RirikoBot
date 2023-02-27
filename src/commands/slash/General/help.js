const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "help",
  description: "Replies with pong!",
  type: 1,
  options: [],
  permissions: {
    DEFAULT_MEMBER_PERMISSIONS: "SendMessages",
  },
  run: async (client, interaction, config, db) => {
    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription("Help page").setColor("Blue")],
      ephemeral: false,
    });
    await interaction.followUp("Pong again!");
  },
};
