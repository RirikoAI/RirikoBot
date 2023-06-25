/**
 * @author ZeroDiscord https://github.com/ZeroDiscord/Giveaway
 */
const ms = require("ms");
module.exports = {
  config: {
    name: "giveaway-reroll",
    description: "Reroll a giveaway.",
    usage: "giveaway-reroll [messageId]",
  },
  category: "Giveaways",
  owner: false,
  run: async (client, message, args) => {
    // If the member doesn't have enough permissions
    if (
      !message.member.permissions.has("ManageMessages") &&
      !message.member.roles.cache.some((r) => r.name === "Giveaways")
    ) {
      return message.reply(
        ":x: You need to have the manage messages permissions to reroll giveaways."
      );
    }

    // If no message ID or giveaway name is specified
    if (!args[0]) {
      return message.reply(":x: You have to specify a valid message ID!");
    }

    // try to found the giveaway with prize then with ID
    let giveaway =
      // Search with giveaway ID
      client.giveawaysManager.giveaways.find((g) => {
        return g.messageId == args[0];
      });

    // If no giveaway was found
    if (!giveaway) {
      return message.reply(
        "Unable to find a giveaway for `" + args.join(" ") + "`."
      );
    }

    // Reroll the giveaway
    client.giveawaysManager
      .reroll(giveaway.messageId)
      .then(() => {
        // Success message
        message.reply("Giveaway rerolled!");
      })
      .catch((e) => {
        if (
          e.startsWith(
            `Giveaway with message ID ${giveaway.messageId} is not ended.`
          )
        ) {
          message.reply("This giveaway is not ended!");
        } else {
          console.error(e);
          message.reply(e);
        }
      });
  },
};
