import { handleReactionRemove } from "handlers/reactionRoles";

const client = require("ririkoBot");
const { getLang } = require("helpers/language");

module.exports = {
  name: "messageReactionRemove",
};

/**
 * on messageReactionRemove event
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
client.on("messageReactionRemove", async (reaction, user) => {
  const lang = getLang();

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (ex) {
      return; // Possibly deleted
    }
  }

  await handleReactionRemove(reaction, user);
});
