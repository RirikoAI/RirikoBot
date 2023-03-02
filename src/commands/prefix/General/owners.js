const { EmbedBuilder } = require("discord.js");
const getconfig = require("utils/getconfig");

module.exports = {
  config: {
    name: "owners",
    description: "Replies with the registered owners only.",
    usage: "owners",
  },
  permissions: ["SendMessages"], // Since the "owner" is TRUE, then we can set the permissions to 'sendMessages'.
  owner: true,
  run: async (client, message, args, prefix, config, db) => {
    const ownersID = getconfig.discordBotOwners();
    if (!ownersID) return;

    const ownersARRAY = [];

    ownersID.forEach((Owner) => {
      const fetchedOWNER = message.guild.members.cache.get(Owner);
      if (!fetchedOWNER) ownersARRAY.push("*Unknown User#0000*");
      ownersARRAY.push(`${fetchedOWNER}`);
    });

    message.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `Only owners command! \nOwners: **${ownersARRAY.join(", ")}**`
          )
          .setColor("Yellow"),
      ],
    });
  },
};
