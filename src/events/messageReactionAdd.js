const client = require("ririkoBot");
const { getLang } = require("helpers/language");
const { reactionRoleHandler } = require("handlers");

module.exports = {
  name: "messageReactionAdd",
};

/**
 * on messageReactionAdd event
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
client.on("messageReactionAdd", async (reaction, user) => {
  const lang = getLang();

  if (user.partial) {
    try {
      await user.fetch();
    } catch (ex) {
      return; // Failed to fetch message (maybe deleted)
    }
  }
  if (user.tag) await user.fetch();
  const { message, emoji } = reaction;
  if (user.bot) return;

  // Reaction Roles
  await reactionRoleHandler.handleReactionAdd(reaction, user);
});
